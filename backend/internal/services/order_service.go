package services

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"math"
	"time"

	"github.com/redis/go-redis/v9"
	"gorm.io/gorm"

	"meryata-souq/backend/internal/config"
	"meryata-souq/backend/internal/currency"
	"meryata-souq/backend/internal/models"
	"meryata-souq/backend/internal/pkg/apperror"
)

// idempotencyKeyPrefix namespaces Idempotency-Key -> order-ID mappings in
// Redis (blueprint §5.8). TTL bounds how long a replayed request is
// deduped for — long enough to cover client retries, short enough not to
// accumulate forever.
const idempotencyKeyPrefix = "order:idempotency:"
const idempotencyTTL = 24 * time.Hour

// OrderService implements cart→order placement with commission, currency,
// and schedule snapshotting (blueprint §4.5, §4.7, §4.10, §7, §8),
// idempotent placement (§5.8), and push notifications on every status
// transition (§4.8) — fired from here, not the handler layer, so every
// current and future caller of a state-changing method gets notifications
// for free rather than each having to remember to trigger them.
type OrderService struct {
	db            *gorm.DB
	redis         *redis.Client
	cache         *config.Cache
	currencySvc   *currency.Service
	hoursSvc      *VendorHoursService
	schedulingSvc *SchedulingService
	notifications *NotificationService
	couponSvc     *CouponService
}

func NewOrderService(db *gorm.DB, redisClient *redis.Client, cache *config.Cache, currencySvc *currency.Service, hoursSvc *VendorHoursService, schedulingSvc *SchedulingService, notifications *NotificationService, couponSvc *CouponService) *OrderService {
	return &OrderService{db: db, redis: redisClient, cache: cache, currencySvc: currencySvc, hoursSvc: hoursSvc, schedulingSvc: schedulingSvc, notifications: notifications, couponSvc: couponSvc}
}

type OrderItemInput struct {
	ProductID string
	Quantity  int
}

type PlaceOrderInput struct {
	UserID         string
	VendorID       string
	Items          []OrderItemInput
	DeliveryLon    float64
	DeliveryLat    float64
	CurrencyCode   string     // optional: user-selected checkout currency, if the store allows it
	ScheduledFor   *time.Time // nil = ASAP
	CouponCode     string     // optional
	IdempotencyKey string
}

// idempotencyPending is the placeholder value written by the atomic
// reservation (SET NX) before the order exists, so a concurrent request
// with the same key sees "someone else is handling this" rather than
// "no key exists yet, proceed."
const idempotencyPending = "pending"

// PlaceOrder validates stock and vendor open/schedule status, snapshots
// commission/currency/schedule, decrements stock, and creates the order +
// items in a single transaction. Replaying the same IdempotencyKey returns
// the original order rather than creating a duplicate (§5.8).
//
// The key is reserved atomically via Redis SET-NX *before* any DB work, not
// merely checked-then-set-after: a plain GET-then-later-SET has a race
// where two concurrent requests with the same key both observe "no
// existing order" and both proceed to create one. SET NX makes the
// reservation itself the single point of truth — only one caller can ever
// win it for a given key.
func (s *OrderService) PlaceOrder(ctx context.Context, in PlaceOrderInput) (*models.Order, *apperror.AppError) {
	if in.IdempotencyKey == "" {
		return nil, apperror.Validation("Idempotency-Key is required")
	}
	if len(in.Items) == 0 {
		return nil, apperror.Validation("at least one item is required")
	}

	reserved, existing, err := s.reserveIdempotencyKey(ctx, in.IdempotencyKey)
	if err != nil {
		return nil, apperror.Internal(err)
	}
	if !reserved {
		if existing == idempotencyPending {
			// A concurrent request with the same key is still in flight.
			// Rather than block, tell the caller to retry shortly — safer
			// than silently waiting an unbounded time inside a request
			// handler.
			return nil, apperror.New("ORDER_IN_PROGRESS", 409,
				"a request with this Idempotency-Key is already being processed",
				"This order is already being processed. Please wait a moment and check your order history.")
		}
		return s.loadOrder(ctx, existing)
	}

	// From here on, any early return MUST release the reservation so a
	// genuine failure (validation, insufficient stock, closed vendor)
	// doesn't permanently block the client from retrying with the same key.
	release := func() {
		if releaseErr := s.redis.Del(ctx, idempotencyKeyPrefix+in.IdempotencyKey).Err(); releaseErr != nil {
			log.Printf("order: failed to release idempotency reservation for key %q: %v", in.IdempotencyKey, releaseErr)
		}
	}

	if err := s.validateAvailability(ctx, in.VendorID, in.ScheduledFor); err != nil {
		release()
		return nil, err
	}

	var order *models.Order
	txErr := s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var txErr *apperror.AppError
		order, txErr = s.placeOrderTx(ctx, tx, in)
		if txErr != nil {
			return txErr
		}
		return nil
	})
	if txErr != nil {
		release()
		if appErr, ok := txErr.(*apperror.AppError); ok {
			return nil, appErr
		}
		return nil, apperror.Internal(fmt.Errorf("order: place order transaction: %w", txErr))
	}

	if err := s.finalizeIdempotency(ctx, in.IdempotencyKey, order.ID); err != nil {
		// The order already committed successfully; a failure to persist
		// the final mapping just means a retry might not find it via the
		// idempotency key (falling through to a fresh placeOrderTx, which
		// would then fail its own stock/availability checks or create a
		// distinguishable duplicate) — logged loudly since a repeatedly
		// failing Redis write here silently erodes the idempotency
		// guarantee for every subsequent retry, not just this one request.
		log.Printf("order: failed to finalize idempotency key %q -> order %q: %v", in.IdempotencyKey, order.ID, err)
	}

	if s.notifications != nil {
		s.notifications.NotifyNewOrderForDrivers(ctx, s.vendorDisplayName(ctx, in.VendorID))
		s.notifications.NotifyNewOrderForVendor(ctx, order)
	}

	return order, nil
}

// vendorDisplayName is a best-effort helper for notification text only —
// errors are swallowed in favor of a generic fallback label, since a
// display-name lookup failure must never fail order placement itself.
func (s *OrderService) vendorDisplayName(ctx context.Context, vendorID string) string {
	var raw []byte
	_ = s.db.WithContext(ctx).Raw(`SELECT name_i18n FROM vendors WHERE id = ?`, vendorID).Row().Scan(&raw)
	if name := extractName(raw); name != "" {
		return name
	}
	return "a nearby store"
}

func (s *OrderService) placeOrderTx(ctx context.Context, tx *gorm.DB, in PlaceOrderInput) (*models.Order, *apperror.AppError) {
	type lineItem struct {
		models.OrderItem
		unitPriceUSD float64
	}

	var lineItems []lineItem
	var subtotalUSD float64

	for _, item := range in.Items {
		if item.Quantity <= 0 {
			return nil, apperror.Validation("quantity must be positive")
		}

		var product models.Product
		if err := tx.Where("id = ? AND vendor_id = ? AND is_active = true", item.ProductID, in.VendorID).First(&product).Error; err != nil {
			if err == gorm.ErrRecordNotFound {
				return nil, apperror.Validation(fmt.Sprintf("product %s not found for this vendor", item.ProductID))
			}
			return nil, apperror.Internal(fmt.Errorf("order: load product: %w", err))
		}

		// Row-locked decrement with a stock guard in the same statement
		// closes the check-then-act race: two concurrent orders for the
		// last unit can't both succeed, since only one UPDATE will match
		// "stock >= quantity".
		result := tx.Exec(`UPDATE products SET stock = stock - ? WHERE id = ? AND stock >= ?`,
			item.Quantity, item.ProductID, item.Quantity)
		if result.Error != nil {
			return nil, apperror.Internal(fmt.Errorf("order: decrement stock: %w", result.Error))
		}
		if result.RowsAffected == 0 {
			return nil, apperror.New("INSUFFICIENT_STOCK", 422,
				fmt.Sprintf("insufficient stock for product %s", item.ProductID),
				"One or more items are out of stock.")
		}

		name := extractName(product.NameI18n)

		lineItems = append(lineItems, lineItem{
			OrderItem: models.OrderItem{
				ID:        newUUID(),
				ProductID: product.ID,
				Name:      name,
				Quantity:  item.Quantity,
			},
			unitPriceUSD: product.PriceUSD,
		})
		subtotalUSD += product.PriceUSD * float64(item.Quantity)
	}
	subtotalUSD = round2(subtotalUSD)

	var couponID *string
	if in.CouponCode != "" {
		coupon, appErr := s.couponSvc.Validate(ctx, in.CouponCode, in.VendorID)
		if appErr != nil {
			return nil, appErr
		}
		// Redeem inside this same transaction: if the rest of order
		// placement fails and rolls back, the redemption rolls back with
		// it — a coupon is never consumed for an order that didn't
		// actually get created. The atomic "WHERE redeemed_count <
		// max_redemptions" guard (not a separate read-then-write) closes
		// the same race class as the stock decrement above.
		if appErr := s.couponSvc.Redeem(ctx, tx, coupon.ID); appErr != nil {
			return nil, appErr
		}
		subtotalUSD = round2(subtotalUSD - applyDiscount(subtotalUSD, coupon.DiscountType, coupon.DiscountVal))
		if subtotalUSD < 0 {
			subtotalUSD = 0
		}
		couponID = &coupon.ID
	}

	commissionPct, appErr := s.resolveCommissionPct(ctx, in.VendorID)
	if appErr != nil {
		return nil, appErr
	}
	commissionUSD := round2(subtotalUSD * commissionPct / 100)

	currencyCode := in.CurrencyCode
	if currencyCode == "" {
		currencyCode, _ = s.cache.AppConfigString("base_currency")
		if currencyCode == "" {
			currencyCode = "USD"
		}
	}
	rate, ok := s.currencySvc.Rate(currencyCode)
	if !ok {
		return nil, apperror.Validation(fmt.Sprintf("currency %q is not active", currencyCode))
	}
	subtotalDisplay, currErr := s.currencySvc.Convert(subtotalUSD, currencyCode)
	if currErr != nil {
		return nil, currErr
	}

	if in.ScheduledFor != nil {
		// Serialize concurrent bookings for the exact same (vendor, slot)
		// pair: ValidateSlot's capacity check (in validateAvailability,
		// called before this transaction opens) is a plain SELECT with no
		// write-time guard, so two concurrent requests for the last unit
		// of capacity could otherwise both pass it and both INSERT,
		// overselling max_per_slot. A Postgres advisory lock keyed on
		// (vendor_id, scheduled_for) makes the second transaction block
		// until the first commits, then re-check capacity itself before
		// the lock is released (transaction-scoped: pg_advisory_xact_lock
		// auto-releases at COMMIT/ROLLBACK).
		if err := tx.Exec(`SELECT pg_advisory_xact_lock(hashtext(?))`, in.VendorID+"|"+in.ScheduledFor.UTC().Format(time.RFC3339)).Error; err != nil {
			return nil, apperror.Internal(fmt.Errorf("order: acquire slot lock: %w", err))
		}
		if err := s.recheckSlotCapacityTx(ctx, tx, in.VendorID, *in.ScheduledFor); err != nil {
			return nil, err
		}
	}

	orderID := newUUID()
	err := tx.Exec(`
		INSERT INTO orders (id, user_id, vendor_id, status, delivery_point, subtotal_usd,
		                    currency_code, exchange_rate, subtotal_display, commission_pct,
		                    commission_usd, coupon_id, scheduled_for, placed_at)
		VALUES (?, ?, ?, 'pending', ST_SetSRID(ST_MakePoint(?, ?), 4326)::geography, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`, orderID, in.UserID, in.VendorID, in.DeliveryLon, in.DeliveryLat, subtotalUSD,
		currencyCode, rate.Rate, subtotalDisplay, commissionPct, commissionUSD, couponID, in.ScheduledFor, time.Now()).Error
	if err != nil {
		return nil, apperror.Internal(fmt.Errorf("order: insert order: %w", err))
	}

	for _, li := range lineItems {
		li.OrderItem.OrderID = orderID
		if err := tx.Exec(`
			INSERT INTO order_items (id, order_id, product_id, name, unit_price_usd, quantity)
			VALUES (?, ?, ?, ?, ?, ?)
		`, li.OrderItem.ID, orderID, li.OrderItem.ProductID, li.OrderItem.Name, li.unitPriceUSD, li.OrderItem.Quantity).Error; err != nil {
			return nil, apperror.Internal(fmt.Errorf("order: insert order item: %w", err))
		}
	}

	return s.loadOrderTx(ctx, tx, orderID)
}

// recheckSlotCapacityTx re-validates slot capacity inside the placement
// transaction, after the (vendor_id, scheduled_for) advisory lock has been
// acquired — this is the authoritative check; validateAvailability's
// earlier ValidateSlot call is only a fast-fail for the common case
// (reject obviously-full/invalid slots before opening a transaction at
// all), not a substitute for this one.
func (s *OrderService) recheckSlotCapacityTx(ctx context.Context, tx *gorm.DB, vendorID string, scheduledFor time.Time) *apperror.AppError {
	var configRaw []byte
	if err := tx.WithContext(ctx).Raw(`SELECT scheduling_config FROM vendors WHERE id = ?`, vendorID).
		Row().Scan(&configRaw); err != nil {
		return apperror.Internal(fmt.Errorf("order: load scheduling_config: %w", err))
	}
	var cfg schedulingConfig
	if err := json.Unmarshal(configRaw, &cfg); err != nil {
		return apperror.Internal(fmt.Errorf("order: parse scheduling_config: %w", err))
	}
	if cfg.MaxPerSlot <= 0 {
		cfg.MaxPerSlot = 1
	}

	var count int64
	if err := tx.WithContext(ctx).Raw(`
		SELECT count(*) FROM orders WHERE vendor_id = ? AND scheduled_for = ? AND status != 'cancelled'
	`, vendorID, scheduledFor).Scan(&count).Error; err != nil {
		return apperror.Internal(fmt.Errorf("order: recheck slot capacity: %w", err))
	}
	if int(count) >= cfg.MaxPerSlot {
		return apperror.New("SLOT_FULL", 422, "slot capacity reached between availability check and booking",
			"This time slot just filled up. Please choose another.")
	}
	return nil
}

// validateAvailability enforces blueprint §8: ASAP orders are blocked when
// the vendor is closed; scheduled orders require both scheduling_allowed
// (admin) and scheduling_enabled (vendor) to be true, AND the requested
// instant must fall on an actual generated, non-full slot — not just any
// arbitrary future timestamp the client sends.
func (s *OrderService) validateAvailability(ctx context.Context, vendorID string, scheduledFor *time.Time) *apperror.AppError {
	if scheduledFor == nil {
		status, appErr := s.hoursSvc.IsOpenNow(ctx, vendorID, time.Now())
		if appErr != nil {
			return appErr
		}
		if !status.IsOpen {
			return apperror.New("VENDOR_CLOSED", 422, "vendor is closed for ASAP orders and no schedule was requested",
				"This store is currently closed. You can schedule an order if available.")
		}
		return nil
	}

	return s.schedulingSvc.ValidateSlot(ctx, vendorID, *scheduledFor)
}

func (s *OrderService) resolveCommissionPct(ctx context.Context, vendorID string) (float64, *apperror.AppError) {
	var vendorPct *float64
	if err := s.db.WithContext(ctx).Raw(`SELECT commission_pct FROM vendors WHERE id = ?`, vendorID).Scan(&vendorPct).Error; err != nil {
		return 0, apperror.Internal(fmt.Errorf("order: load vendor commission: %w", err))
	}
	if vendorPct != nil {
		return *vendorPct, nil
	}
	defaultConfig, ok := s.cache.AppConfig("commission_default_pct")
	if !ok {
		return 0, apperror.Internal(fmt.Errorf("order: commission_default_pct not configured"))
	}
	var pct float64
	if err := json.Unmarshal(defaultConfig.Value, &pct); err != nil {
		return 0, apperror.Internal(fmt.Errorf("order: parse commission_default_pct: %w", err))
	}
	return pct, nil
}

// reserveIdempotencyKey atomically claims key via Redis SET-NX. If the key
// was unclaimed, this call itself claims it (writing idempotencyPending)
// and returns reserved=true — the caller is now the sole owner and must
// eventually call finalizeIdempotency or release it. If the key was
// already claimed, returns reserved=false and the current value (either
// idempotencyPending, meaning another request is still in flight, or a
// real order ID from a prior completed request).
func (s *OrderService) reserveIdempotencyKey(ctx context.Context, key string) (reserved bool, existingValue string, err error) {
	ok, err := s.redis.SetNX(ctx, idempotencyKeyPrefix+key, idempotencyPending, idempotencyTTL).Result()
	if err != nil {
		return false, "", fmt.Errorf("order: reserve idempotency key: %w", err)
	}
	if ok {
		return true, "", nil
	}
	existing, err := s.redis.Get(ctx, idempotencyKeyPrefix+key).Result()
	if err == redis.Nil {
		// Vanishingly unlikely (the key expired or was deleted between the
		// failed SETNX and this GET) — treat as if we'd won the reservation
		// on a fresh attempt rather than erroring the request.
		return s.reserveIdempotencyKey(ctx, key)
	}
	if err != nil {
		return false, "", fmt.Errorf("order: read existing idempotency value: %w", err)
	}
	return false, existing, nil
}

func (s *OrderService) finalizeIdempotency(ctx context.Context, key, orderID string) error {
	return s.redis.Set(ctx, idempotencyKeyPrefix+key, orderID, idempotencyTTL).Err()
}

// orderSelectColumns is shared by every order read path. models.Order's
// DeliveryLongitude/DeliveryLatitude are computed from the PostGIS
// delivery_point column via ST_X/ST_Y — they are NOT populated by GORM's
// ordinary Find/First (which only reads real table columns), so every
// query that returns an Order to a caller who might read those fields must
// use this raw SELECT, not a plain GORM query builder call.
const orderSelectColumns = `
	SELECT id, user_id, vendor_id, driver_id, status, subtotal_usd, currency_code,
	       exchange_rate, subtotal_display, commission_pct, commission_usd, coupon_id,
	       scheduled_for, placed_at, delivered_at,
	       ST_X(delivery_point::geometry) AS delivery_longitude,
	       ST_Y(delivery_point::geometry) AS delivery_latitude
	FROM orders`

func (s *OrderService) loadOrder(ctx context.Context, orderID string) (*models.Order, *apperror.AppError) {
	return s.loadOrderTx(ctx, s.db, orderID)
}

func (s *OrderService) loadOrderTx(ctx context.Context, tx *gorm.DB, orderID string) (*models.Order, *apperror.AppError) {
	var o models.Order
	err := tx.WithContext(ctx).Raw(orderSelectColumns+` WHERE id = ?`, orderID).Scan(&o).Error
	if err != nil {
		return nil, apperror.Internal(fmt.Errorf("order: load: %w", err))
	}
	if o.ID == "" {
		return nil, apperror.NotFound("order")
	}
	return &o, nil
}

func round2(v float64) float64 {
	return math.Round(v*100) / 100
}

// applyDiscount returns the discount AMOUNT (not the resulting total) for
// a coupon's discount_type/discount_val applied to subtotalUSD. "percent"
// treats discount_val as a percentage (e.g. 10 -> 10%); "fixed" treats it
// as a flat USD amount, capped at the subtotal so a discount can never
// make the order go negative before the caller's own floor-at-zero clamp.
func applyDiscount(subtotalUSD float64, discountType string, discountVal float64) float64 {
	switch discountType {
	case "percent":
		return subtotalUSD * discountVal / 100
	case "fixed":
		if discountVal > subtotalUSD {
			return subtotalUSD
		}
		return discountVal
	default:
		return 0
	}
}

// extractName pulls the "en" value from a name_i18n JSONB blob for
// order_items.name (a denormalized snapshot, not locale-aware — order
// history shows the name as it was at purchase time in a single fallback
// language, per the orders schema having a plain TEXT name column, not
// JSONB).
func extractName(nameI18n json.RawMessage) string {
	var m map[string]string
	if err := json.Unmarshal(nameI18n, &m); err != nil {
		return ""
	}
	if en, ok := m["en"]; ok {
		return en
	}
	for _, v := range m {
		return v
	}
	return ""
}
