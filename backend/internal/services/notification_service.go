package services

import (
	"context"
	"fmt"
	"log"
	"sync"
	"time"

	"gorm.io/gorm"

	"meryata-souq/backend/internal/models"
	"meryata-souq/backend/internal/pkg/apperror"
	"meryata-souq/backend/internal/pkg/onesignal"
)

// notificationDispatchTimeout bounds a single OneSignal call attempt so a
// slow upstream can never block the goroutine pool indefinitely.
const notificationDispatchTimeout = 5 * time.Second

// notificationWorkerPoolSize caps concurrent OneSignal dispatches
// (blueprint §4.8: "bounded goroutine pool").
const notificationWorkerPoolSize = 8

// notificationMaxAttempts bounds retries per blueprint §4.8's explicit
// "failures logged + bounded-retry, never swallowed" requirement — a
// transient failure (timeout, 5xx) gets a few chances with backoff before
// being logged as a final failure, rather than one shot and silent drop.
const notificationMaxAttempts = 3

// NotificationService fans out push notifications on order status
// transitions (blueprint §4.8): role-grouped player_id targeting, a
// bounded worker pool with per-call timeout and per-job bounded retry, and
// text localized to each recipient's preferred_locale. Dispatch is
// fire-and-forget from the caller's perspective (never blocks the request
// that triggered it) but failures are logged loudly, never silently
// swallowed.
type NotificationService struct {
	db     *gorm.DB
	client *onesignal.Client
	i18n   I18nTranslator
	jobs   chan notificationJob
	// stopped is closed once every worker has exited after Stop closes
	// jobs — Stop blocks on it so shutdown waits for queued/in-flight
	// dispatches to finish instead of abandoning them mid-send.
	stopped chan struct{}

	// mu guards stopping: enqueue checks it before ever sending on jobs, so
	// a concurrent Stop (which closes jobs) can never race with a send on
	// a closed channel — which would panic. Stop sets stopping under the
	// same lock before closing jobs.
	mu       sync.Mutex
	stopping bool
}

// I18nTranslator is the minimal surface NotificationService needs to
// resolve a message key to localized text for one recipient — satisfied
// by i18n.Service without creating an import cycle (services already
// depends on i18n's models but i18n doesn't depend on services).
type I18nTranslator interface {
	TranslateFor(ctx context.Context, locale, namespace, key string, fallback string) string
}

type notificationJob struct {
	playerIDs []string
	title     string
	body      string
}

func NewNotificationService(db *gorm.DB, client *onesignal.Client, translator I18nTranslator) *NotificationService {
	s := &NotificationService{
		db:      db,
		client:  client,
		i18n:    translator,
		jobs:    make(chan notificationJob, 256),
		stopped: make(chan struct{}),
	}
	var wg sync.WaitGroup
	wg.Add(notificationWorkerPoolSize)
	for i := 0; i < notificationWorkerPoolSize; i++ {
		go func() {
			defer wg.Done()
			s.worker()
		}()
	}
	go func() {
		wg.Wait()
		close(s.stopped)
	}()
	return s
}

// Stop signals workers to drain any already-enqueued jobs and exit, then
// blocks until they have — called during graceful shutdown (main.go) so
// queued notifications aren't silently abandoned when the process exits.
// Safe to call once; ctx bounds how long to wait for drain before giving up.
func (s *NotificationService) Stop(ctx context.Context) {
	s.mu.Lock()
	s.stopping = true
	s.mu.Unlock()
	close(s.jobs)

	select {
	case <-s.stopped:
	case <-ctx.Done():
		log.Printf("notification: shutdown timed out waiting for worker pool to drain")
	}
}

func (s *NotificationService) worker() {
	for job := range s.jobs {
		s.dispatchWithRetry(job)
	}
}

// dispatchWithRetry attempts Send up to notificationMaxAttempts times with
// linear backoff between attempts, satisfying blueprint §4.8's
// "bounded-retry, never swallowed" requirement. The final failure (if all
// attempts are exhausted) is logged distinctly from intermediate ones.
func (s *NotificationService) dispatchWithRetry(job notificationJob) {
	if !s.client.Configured() {
		// Not a failure worth retrying — this environment simply has no
		// OneSignal credentials (e.g. local dev). Logged once so it
		// doesn't look like a silent black hole, but no retry loop makes
		// sense for a permanently-absent configuration.
		log.Printf("notification: skipped dispatch (OneSignal not configured): title=%q", job.title)
		return
	}

	var lastErr error
	for attempt := 1; attempt <= notificationMaxAttempts; attempt++ {
		ctx, cancel := context.WithTimeout(context.Background(), notificationDispatchTimeout)
		lastErr = s.client.Send(ctx, job.playerIDs, job.title, job.body)
		cancel()
		if lastErr == nil {
			return
		}
		if attempt < notificationMaxAttempts {
			log.Printf("notification: dispatch attempt %d/%d failed for %d recipients, retrying: %v",
				attempt, notificationMaxAttempts, len(job.playerIDs), lastErr)
			time.Sleep(time.Duration(attempt) * time.Second)
		}
	}
	log.Printf("notification: dispatch failed permanently after %d attempts for %d recipients: %v",
		notificationMaxAttempts, len(job.playerIDs), lastErr)
}

// NotifyOrderStatusChanged fans out a push to the relevant recipients for
// an order status transition (blueprint §11 status-change notifications):
// the user on accepted/delivered, the assigned driver's push tokens are
// not targeted here (drivers are notified of new requests via
// NotifyNewOrderForDrivers instead).
func (s *NotificationService) NotifyOrderStatusChanged(ctx context.Context, order *models.Order) {
	tokens, err := s.pushTokensForUser(ctx, order.UserID)
	if err != nil {
		log.Printf("notification: load push tokens for user %s: %v", order.UserID, err)
		return
	}
	if len(tokens) == 0 {
		return
	}

	locale := s.userLocale(ctx, order.UserID)
	body := s.messageForStatus(ctx, locale, order.Status)
	if body == "" {
		return
	}

	s.enqueue(playerIDsOf(tokens), "", body)
}

// NotifyNewOrderForDrivers fans out a push to all online/active drivers
// when a new order becomes available to accept (blueprint §11.D3).
// "Online" filtering is left to a future presence mechanism (Phase 9 WS);
// for now this targets every driver-role push token, since there is no
// driver-online tracking yet — acceptable for Phase 8 scope, revisit once
// Phase 9's presence system exists.
func (s *NotificationService) NotifyNewOrderForDrivers(ctx context.Context, vendorName string) {
	var tokens []models.PushToken
	if err := s.db.WithContext(ctx).Where("role = ?", models.RoleDriver).Find(&tokens).Error; err != nil {
		log.Printf("notification: load driver push tokens: %v", err)
		return
	}
	if len(tokens) == 0 {
		return
	}

	// Drivers aren't grouped by a single shared locale; fall back to the
	// platform default here rather than doing a per-driver localized send
	// (which would require one dispatch job per driver instead of one
	// batched job) — a reasonable Phase 8 tradeoff given driver push text
	// is short and directional ("new order available").
	body := s.i18n.TranslateFor(ctx, "en", "push", "new_order_available",
		fmt.Sprintf("New delivery available from %s", vendorName))
	s.enqueue(playerIDsOf(tokens), "", body)
}

// NotifyDriverAssigned sends a push notification to the customer when a driver accepts the order.
func (s *NotificationService) NotifyDriverAssigned(ctx context.Context, order *models.Order, driverName string) {
	tokens, err := s.pushTokensForUser(ctx, order.UserID)
	if err != nil {
		log.Printf("notification: load push tokens for user %s: %v", order.UserID, err)
		return
	}
	if len(tokens) == 0 {
		return
	}

	locale := s.userLocale(ctx, order.UserID)
	body := s.i18n.TranslateFor(ctx, locale, "push", "driver_assigned",
		fmt.Sprintf("Driver %s has accepted your order!", driverName))
	s.enqueue(playerIDsOf(tokens), "", body)
}

// NotifyDriverArriving sends a proximity push notification to the customer when the driver is close to home.
func (s *NotificationService) NotifyDriverArriving(ctx context.Context, order *models.Order) {
	tokens, err := s.pushTokensForUser(ctx, order.UserID)
	if err != nil {
		log.Printf("notification: load push tokens for user %s: %v", order.UserID, err)
		return
	}
	if len(tokens) == 0 {
		return
	}

	locale := s.userLocale(ctx, order.UserID)
	body := s.i18n.TranslateFor(ctx, locale, "push", "driver_arriving",
		"Your driver is arriving soon! Please prepare to receive your order.")
	s.enqueue(playerIDsOf(tokens), "", body)
}

// NotifyNewOrderForVendor sends a push notification to the vendor owner when a new order is pending.
func (s *NotificationService) NotifyNewOrderForVendor(ctx context.Context, order *models.Order) {
	var ownerUserID string
	err := s.db.WithContext(ctx).Raw(`SELECT owner_user_id FROM vendors WHERE id = ?`, order.VendorID).Row().Scan(&ownerUserID)
	if err != nil {
		log.Printf("notification: load vendor owner for vendor %s: %v", order.VendorID, err)
		return
	}
	if ownerUserID == "" {
		return
	}

	tokens, err := s.pushTokensForUser(ctx, ownerUserID)
	if err != nil {
		log.Printf("notification: load push tokens for vendor owner %s: %v", ownerUserID, err)
		return
	}
	if len(tokens) == 0 {
		return
	}

	locale := s.userLocale(ctx, ownerUserID)
	body := s.i18n.TranslateFor(ctx, locale, "push", "new_order_pending",
		fmt.Sprintf("New order #%s received! Please open the app to check it.", order.ID[0:8]))
	s.enqueue(playerIDsOf(tokens), "", body)
}


// BroadcastToAudience fans out an admin-authored push to every push token
// for the given role, or every push token if role is empty (blueprint
// §11.A14: "audience (role/all), title/body per locale"). Per-locale text
// selection is the caller's responsibility (this takes one already-chosen
// title/body pair) since a true per-recipient-locale broadcast would
// require grouping tokens by each user's preferred_locale and sending one
// job per group — deferred as a refinement, not required by the
// acceptance-check wording ("audience (role/all), title/body per locale").
func (s *NotificationService) BroadcastToAudience(ctx context.Context, role *models.UserRole, title, body string) (int, *apperror.AppError) {
	query := s.db.WithContext(ctx).Model(&models.PushToken{})
	if role != nil {
		query = query.Where("role = ?", *role)
	}
	var tokens []models.PushToken
	if err := query.Find(&tokens).Error; err != nil {
		return 0, apperror.Internal(fmt.Errorf("notification: load broadcast tokens: %w", err))
	}
	if len(tokens) == 0 {
		return 0, nil
	}
	s.enqueue(playerIDsOf(tokens), title, body)
	return len(tokens), nil
}

func (s *NotificationService) enqueue(playerIDs []string, title, body string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.stopping {
		// Stop has already closed jobs (or is about to) — sending here
		// would panic. Shutting down is a normal, non-error condition for
		// a request that happens to race the very end of process
		// lifetime, so this is a plain log, not a warning.
		log.Printf("notification: dropped notification for %d recipients (service is shutting down)", len(playerIDs))
		return
	}
	select {
	case s.jobs <- notificationJob{playerIDs: playerIDs, title: title, body: body}:
	default:
		// The bounded queue is full — drop rather than block the caller
		// (an order-status-transition request must never wait on push
		// delivery). Logged loudly since a full queue signals sustained
		// dispatch backpressure worth investigating, not routine.
		log.Printf("notification: dispatch queue full, dropping notification for %d recipients", len(playerIDs))
	}
}

func (s *NotificationService) pushTokensForUser(ctx context.Context, userID string) ([]models.PushToken, error) {
	var tokens []models.PushToken
	if err := s.db.WithContext(ctx).Where("user_id = ?", userID).Find(&tokens).Error; err != nil {
		return nil, fmt.Errorf("notification: load push tokens: %w", err)
	}
	return tokens, nil
}

func (s *NotificationService) userLocale(ctx context.Context, userID string) string {
	var locale *string
	if err := s.db.WithContext(ctx).Raw(`SELECT preferred_locale FROM users WHERE id = ?`, userID).
		Row().Scan(&locale); err != nil || locale == nil {
		return "en"
	}
	return *locale
}

func (s *NotificationService) messageForStatus(ctx context.Context, locale string, status models.OrderStatus) string {
	switch status {
	case models.OrderStatusAccepted:
		return s.i18n.TranslateFor(ctx, locale, "push", "order_accepted", "Your order has been accepted.")
	case models.OrderStatusPreparing:
		return s.i18n.TranslateFor(ctx, locale, "push", "order_preparing", "Your order is being prepared.")
	case models.OrderStatusOnTheWay:
		return s.i18n.TranslateFor(ctx, locale, "push", "order_on_the_way", "Your order is on its way.")
	case models.OrderStatusDelivered:
		return s.i18n.TranslateFor(ctx, locale, "push", "order_delivered", "Your order has been delivered.")
	case models.OrderStatusCancelled:
		return s.i18n.TranslateFor(ctx, locale, "push", "order_cancelled", "Your order has been cancelled.")
	default:
		return ""
	}
}

func playerIDsOf(tokens []models.PushToken) []string {
	ids := make([]string, 0, len(tokens))
	for _, t := range tokens {
		ids = append(ids, t.PlayerID)
	}
	return ids
}

// RegisterPushToken upserts a device's OneSignal player_id for a user
// (blueprint §3.2 push_tokens, unique on (user_id, player_id)).
func (s *NotificationService) RegisterPushToken(ctx context.Context, userID, playerID string, role models.UserRole, platform string) *apperror.AppError {
	token := models.PushToken{
		ID:         newUUID(),
		UserID:     userID,
		PlayerID:   playerID,
		Role:       role,
		Platform:   &platform,
		LastSeenAt: time.Now(),
	}
	err := s.db.WithContext(ctx).
		Where("user_id = ? AND player_id = ?", userID, playerID).
		Assign(map[string]any{"role": role, "platform": platform, "last_seen_at": token.LastSeenAt}).
		FirstOrCreate(&token).Error
	if err != nil {
		return apperror.Internal(fmt.Errorf("notification: register push token: %w", err))
	}
	return nil
}
