package services

import (
	"context"
	"os"
	"sync"
	"testing"
	"time"

	"github.com/joho/godotenv"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"

	"meryata-souq/backend/internal/config"
	"meryata-souq/backend/internal/currency"
	"meryata-souq/backend/internal/models"
	"meryata-souq/backend/internal/pkg/apperror"
)

// These are integration tests against the real Postgres instance (blueprint
// §15 item 7's acceptance check requires exercising real snapshot/schedule/
// idempotency behavior end-to-end, which in-memory fakes can't faithfully
// reproduce given JSONB, PostGIS, and NUMERIC precision are all load-bearing
// here). Skipped automatically if DATABASE_URL isn't configured, so `go test
// ./...` still passes in environments without DB access.
func testDB(t *testing.T) *gorm.DB {
	t.Helper()
	_ = godotenv.Load("../../.env")
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		t.Skip("DATABASE_URL not set, skipping integration test")
	}
	db, err := gorm.Open(postgres.Open(dsn), &gorm.Config{})
	if err != nil {
		t.Fatalf("connect test db: %v", err)
	}
	return db
}

// seedOrderFixture creates a user, vendor (open 24/7, scheduling allowed +
// enabled), category-less product, and returns their IDs. Cleanup is the
// caller's responsibility via the returned cleanup func.
func seedOrderFixture(t *testing.T, db *gorm.DB) (userID, vendorID, productID string, cleanup func()) {
	t.Helper()
	ctx := context.Background()

	userID = newUUID()
	if err := db.WithContext(ctx).Exec(`
		INSERT INTO users (id, phone, phone_verified, role, is_active, created_at, updated_at)
		VALUES (?, ?, true, 'user', true, now(), now())
	`, userID, "+9613"+randDigits(6)).Error; err != nil {
		t.Fatalf("seed user: %v", err)
	}

	vendorID = newUUID()
	if err := db.WithContext(ctx).Exec(`
		INSERT INTO vendors (id, owner_user_id, name_i18n, category, location, timezone,
		                     scheduling_allowed, scheduling_enabled, scheduling_config, created_at)
		VALUES (?, ?, '{"en":"Test Vendor"}', 'test', ST_SetSRID(ST_MakePoint(35.5,33.9),4326)::geography,
		        'Asia/Beirut', true, true, '{"slot_minutes":30,"lead_minutes":30,"max_days_ahead":7,"max_per_slot":5}', now())
	`, vendorID, userID).Error; err != nil {
		t.Fatalf("seed vendor: %v", err)
	}
	// Open all day every day so ASAP-order tests aren't time-of-day flaky.
	for day := 0; day <= 6; day++ {
		if err := db.WithContext(ctx).Exec(`
			INSERT INTO vendor_hours (id, vendor_id, day_of_week, open_time, close_time, is_closed)
			VALUES (?, ?, ?, '00:00:00', '23:59:00', false)
		`, newUUID(), vendorID, day).Error; err != nil {
			t.Fatalf("seed vendor_hours: %v", err)
		}
	}

	productID = newUUID()
	if err := db.WithContext(ctx).Exec(`
		INSERT INTO products (id, vendor_id, name_i18n, description_i18n, price_usd, stock, is_active, created_at)
		VALUES (?, ?, '{"en":"Widget"}', '{}', 10.00, 5, true, now())
	`, productID, vendorID).Error; err != nil {
		t.Fatalf("seed product: %v", err)
	}

	cleanup = func() {
		db.Exec(`DELETE FROM order_items WHERE order_id IN (SELECT id FROM orders WHERE vendor_id = ?)`, vendorID)
		db.Exec(`DELETE FROM orders WHERE vendor_id = ?`, vendorID)
		db.Exec(`DELETE FROM products WHERE vendor_id = ?`, vendorID)
		db.Exec(`DELETE FROM vendor_hours WHERE vendor_id = ?`, vendorID)
		db.Exec(`DELETE FROM vendors WHERE id = ?`, vendorID)
		db.Exec(`DELETE FROM users WHERE id = ?`, userID)
	}
	return
}

func randDigits(n int) string {
	b := make([]byte, n)
	for i := range b {
		b[i] = byte('0' + (time.Now().UnixNano()+int64(i))%10)
	}
	return string(b)
}

// TestPlaceOrder_HappyPath_ASAP verifies the core acceptance-check
// invariant: an ASAP order at a vendor that's open snapshots commission,
// currency, and subtotal correctly, and decrements stock.
func TestPlaceOrder_HappyPath_ASAP(t *testing.T) {
	db := testDB(t)
	userID, vendorID, productID, cleanup := seedOrderFixture(t, db)
	defer cleanup()

	svc := newTestOrderService(t, db)

	order, appErr := svc.PlaceOrder(context.Background(), PlaceOrderInput{
		UserID:         userID,
		VendorID:       vendorID,
		Items:          []OrderItemInput{{ProductID: productID, Quantity: 2}},
		DeliveryLon:    35.5,
		DeliveryLat:    33.9,
		IdempotencyKey: newUUID(),
	})
	if appErr != nil {
		t.Fatalf("PlaceOrder failed: %v", appErr)
	}

	if order.SubtotalUSD != 20.00 {
		t.Errorf("SubtotalUSD = %v, want 20.00", order.SubtotalUSD)
	}
	if order.CurrencyCode != "USD" {
		t.Errorf("CurrencyCode = %v, want USD (default base currency)", order.CurrencyCode)
	}
	if order.ExchangeRate != 1 {
		t.Errorf("ExchangeRate = %v, want 1", order.ExchangeRate)
	}
	if order.SubtotalDisplay != 20.00 {
		t.Errorf("SubtotalDisplay = %v, want 20.00", order.SubtotalDisplay)
	}
	if order.CommissionPct <= 0 {
		t.Errorf("CommissionPct = %v, want > 0 (should snapshot app default)", order.CommissionPct)
	}
	expectedCommission := round2(20.00 * order.CommissionPct / 100)
	if order.CommissionUSD != expectedCommission {
		t.Errorf("CommissionUSD = %v, want %v", order.CommissionUSD, expectedCommission)
	}
	if order.ScheduledFor != nil {
		t.Errorf("ScheduledFor = %v, want nil for ASAP order", order.ScheduledFor)
	}
	if order.Status != models.OrderStatusPending {
		t.Errorf("Status = %v, want pending", order.Status)
	}

	var stock int
	if err := db.Raw(`SELECT stock FROM products WHERE id = ?`, productID).Scan(&stock).Error; err != nil {
		t.Fatalf("check stock: %v", err)
	}
	if stock != 3 {
		t.Errorf("stock after ordering 2 of 5 = %v, want 3", stock)
	}
}

// TestPlaceOrder_Idempotency verifies blueprint §5.8: replaying the same
// Idempotency-Key returns the original order rather than creating a
// second one or double-decrementing stock.
func TestPlaceOrder_Idempotency(t *testing.T) {
	db := testDB(t)
	userID, vendorID, productID, cleanup := seedOrderFixture(t, db)
	defer cleanup()

	svc := newTestOrderService(t, db)
	idempotencyKey := newUUID()

	input := PlaceOrderInput{
		UserID:         userID,
		VendorID:       vendorID,
		Items:          []OrderItemInput{{ProductID: productID, Quantity: 1}},
		DeliveryLon:    35.5,
		DeliveryLat:    33.9,
		IdempotencyKey: idempotencyKey,
	}

	first, appErr := svc.PlaceOrder(context.Background(), input)
	if appErr != nil {
		t.Fatalf("first PlaceOrder failed: %v", appErr)
	}

	second, appErr := svc.PlaceOrder(context.Background(), input)
	if appErr != nil {
		t.Fatalf("second PlaceOrder (replay) failed: %v", appErr)
	}

	if first.ID != second.ID {
		t.Errorf("replayed request created a different order: first=%s second=%s", first.ID, second.ID)
	}

	var orderCount int64
	db.Model(&models.Order{}).Where("vendor_id = ?", vendorID).Count(&orderCount)
	if orderCount != 1 {
		t.Errorf("order count after 2 identical requests = %d, want 1", orderCount)
	}

	var stock int
	db.Raw(`SELECT stock FROM products WHERE id = ?`, productID).Scan(&stock)
	if stock != 4 {
		t.Errorf("stock after one order of qty 1 (not double-decremented) = %v, want 4", stock)
	}
}

// TestPlaceOrder_IdempotencyConcurrent verifies blueprint §5.8 under actual
// concurrency, not just sequential replay: N goroutines firing the same
// Idempotency-Key simultaneously must produce exactly one order, never
// more — this is the scenario a plain GET-then-later-SET can't guarantee
// (two requests can both observe "no existing key" before either writes),
// which is why PlaceOrder reserves the key via atomic Redis SET-NX before
// doing any DB work.
func TestPlaceOrder_IdempotencyConcurrent(t *testing.T) {
	db := testDB(t)
	userID, vendorID, productID, cleanup := seedOrderFixture(t, db)
	defer cleanup()

	svc := newTestOrderService(t, db)
	idempotencyKey := newUUID()

	const concurrency = 8
	type result struct {
		order  *models.Order
		appErr *apperror.AppError
	}
	results := make([]result, concurrency)
	var wg sync.WaitGroup
	for i := 0; i < concurrency; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			order, appErr := svc.PlaceOrder(context.Background(), PlaceOrderInput{
				UserID:         userID,
				VendorID:       vendorID,
				Items:          []OrderItemInput{{ProductID: productID, Quantity: 1}},
				DeliveryLon:    35.5,
				DeliveryLat:    33.9,
				IdempotencyKey: idempotencyKey,
			})
			results[i] = result{order: order, appErr: appErr}
		}(i)
	}
	wg.Wait()

	var orderCount int64
	db.Model(&models.Order{}).Where("vendor_id = ?", vendorID).Count(&orderCount)
	if orderCount != 1 {
		t.Errorf("order count after %d concurrent identical requests = %d, want 1", concurrency, orderCount)
	}

	var stock int
	db.Raw(`SELECT stock FROM products WHERE id = ?`, productID).Scan(&stock)
	if stock != 4 {
		t.Errorf("stock after concurrent requests for the same idempotency key (should decrement once) = %v, want 4", stock)
	}
}

// TestPlaceOrder_CouponDiscountAndExhaustion verifies blueprint §11.A9/B10:
// a coupon discount reduces the order's subtotal (commission calculated on
// the post-discount amount), redeemed_count increments, and once
// max_redemptions is reached a subsequent order is rejected rather than
// silently ignoring the coupon or over-redeeming it.
func TestPlaceOrder_CouponDiscountAndExhaustion(t *testing.T) {
	db := testDB(t)
	userID, vendorID, productID, cleanup := seedOrderFixture(t, db)
	defer cleanup()

	maxRedemptions := 1
	couponID := newUUID()
	if err := db.Exec(`
		INSERT INTO coupons (id, vendor_id, code, discount_type, discount_val, max_redemptions, redeemed_count, is_active)
		VALUES (?, ?, 'TESTCOUPON', 'percent', 20, ?, 0, true)
	`, couponID, vendorID, maxRedemptions).Error; err != nil {
		t.Fatalf("seed coupon: %v", err)
	}
	defer db.Exec(`DELETE FROM coupons WHERE id = ?`, couponID)

	svc := newTestOrderService(t, db)

	order, appErr := svc.PlaceOrder(context.Background(), PlaceOrderInput{
		UserID:         userID,
		VendorID:       vendorID,
		Items:          []OrderItemInput{{ProductID: productID, Quantity: 2}}, // 2 x $10 = $20
		DeliveryLon:    35.5,
		DeliveryLat:    33.9,
		CouponCode:     "TESTCOUPON",
		IdempotencyKey: newUUID(),
	})
	if appErr != nil {
		t.Fatalf("PlaceOrder with coupon failed: %v", appErr)
	}
	if order.SubtotalUSD != 16.00 {
		t.Errorf("SubtotalUSD with 20%% off $20 = %v, want 16.00", order.SubtotalUSD)
	}
	expectedCommission := round2(16.00 * order.CommissionPct / 100)
	if order.CommissionUSD != expectedCommission {
		t.Errorf("CommissionUSD = %v, want %v (calculated on post-discount subtotal)", order.CommissionUSD, expectedCommission)
	}

	var redeemedCount int
	db.Raw(`SELECT redeemed_count FROM coupons WHERE id = ?`, couponID).Scan(&redeemedCount)
	if redeemedCount != 1 {
		t.Errorf("redeemed_count after one use = %d, want 1", redeemedCount)
	}

	_, appErr = svc.PlaceOrder(context.Background(), PlaceOrderInput{
		UserID:         userID,
		VendorID:       vendorID,
		Items:          []OrderItemInput{{ProductID: productID, Quantity: 1}},
		DeliveryLon:    35.5,
		DeliveryLat:    33.9,
		CouponCode:     "TESTCOUPON",
		IdempotencyKey: newUUID(),
	})
	if appErr == nil {
		t.Fatal("expected PlaceOrder to reject an exhausted coupon (max_redemptions=1, already used), got success")
	}
	if appErr.Code != "COUPON_EXHAUSTED" {
		t.Errorf("error code = %v, want COUPON_EXHAUSTED", appErr.Code)
	}
}

// TestPlaceOrder_ASAPBlockedWhenClosed verifies blueprint §8: ASAP ordering
// is rejected when the vendor is closed and has no scheduling enabled path
// selected by the caller.
func TestPlaceOrder_ASAPBlockedWhenClosed(t *testing.T) {
	db := testDB(t)
	userID, vendorID, productID, cleanup := seedOrderFixture(t, db)
	defer cleanup()

	// Force closed: override every weekday's hours to is_closed.
	db.Exec(`UPDATE vendor_hours SET is_closed = true WHERE vendor_id = ?`, vendorID)

	svc := newTestOrderService(t, db)
	_, appErr := svc.PlaceOrder(context.Background(), PlaceOrderInput{
		UserID:         userID,
		VendorID:       vendorID,
		Items:          []OrderItemInput{{ProductID: productID, Quantity: 1}},
		DeliveryLon:    35.5,
		DeliveryLat:    33.9,
		IdempotencyKey: newUUID(),
	})
	if appErr == nil {
		t.Fatal("expected PlaceOrder to fail when vendor is closed and no schedule requested, got success")
	}
	if appErr.Code != "VENDOR_CLOSED" {
		t.Errorf("error code = %v, want VENDOR_CLOSED", appErr.Code)
	}
}

// TestPlaceOrder_InsufficientStock verifies stock validation at checkout.
func TestPlaceOrder_InsufficientStock(t *testing.T) {
	db := testDB(t)
	userID, vendorID, productID, cleanup := seedOrderFixture(t, db)
	defer cleanup()

	svc := newTestOrderService(t, db)
	_, appErr := svc.PlaceOrder(context.Background(), PlaceOrderInput{
		UserID:         userID,
		VendorID:       vendorID,
		Items:          []OrderItemInput{{ProductID: productID, Quantity: 999}},
		DeliveryLon:    35.5,
		DeliveryLat:    33.9,
		IdempotencyKey: newUUID(),
	})
	if appErr == nil {
		t.Fatal("expected PlaceOrder to fail for insufficient stock, got success")
	}
	if appErr.Code != "INSUFFICIENT_STOCK" {
		t.Errorf("error code = %v, want INSUFFICIENT_STOCK", appErr.Code)
	}
}

// TestPlaceOrder_ScheduledSlotHonored verifies blueprint §8/§15 item 7: a
// scheduled order at a generated, available slot succeeds and snapshots
// scheduled_for correctly; a scheduled order for an arbitrary timestamp
// NOT on a generated slot boundary is rejected.
func TestPlaceOrder_ScheduledSlotHonored(t *testing.T) {
	db := testDB(t)
	userID, vendorID, productID, cleanup := seedOrderFixture(t, db)
	defer cleanup()

	svc := newTestOrderService(t, db)
	schedulingSvc := NewSchedulingService(db, NewVendorHoursService(db))

	slots, appErr := schedulingSvc.AvailableSlots(context.Background(), vendorID)
	if appErr != nil {
		t.Fatalf("AvailableSlots failed: %v", appErr)
	}
	if len(slots) == 0 {
		t.Fatal("expected at least one available slot for a 24/7 open, scheduling-enabled vendor")
	}
	chosenSlot := slots[0].StartAt

	order, appErr := svc.PlaceOrder(context.Background(), PlaceOrderInput{
		UserID:         userID,
		VendorID:       vendorID,
		Items:          []OrderItemInput{{ProductID: productID, Quantity: 1}},
		DeliveryLon:    35.5,
		DeliveryLat:    33.9,
		ScheduledFor:   &chosenSlot,
		IdempotencyKey: newUUID(),
	})
	if appErr != nil {
		t.Fatalf("PlaceOrder with valid slot failed: %v", appErr)
	}
	if order.ScheduledFor == nil {
		t.Fatal("ScheduledFor is nil, want the chosen slot time")
	}
	if !order.ScheduledFor.Equal(chosenSlot) {
		t.Errorf("ScheduledFor = %v, want %v", order.ScheduledFor, chosenSlot)
	}

	arbitraryTime := time.Now().Add(3 * time.Hour).Add(17 * time.Minute) // unlikely to land on a slot boundary
	_, appErr = svc.PlaceOrder(context.Background(), PlaceOrderInput{
		UserID:         userID,
		VendorID:       vendorID,
		Items:          []OrderItemInput{{ProductID: productID, Quantity: 1}},
		DeliveryLon:    35.5,
		DeliveryLat:    33.9,
		ScheduledFor:   &arbitraryTime,
		IdempotencyKey: newUUID(),
	})
	if appErr == nil {
		t.Fatal("expected PlaceOrder to reject a scheduled_for not on a generated slot boundary, got success")
	}
}

// newTestOrderService constructs a real OrderService wired against the
// live config cache (so commission_default_pct / base_currency come from
// actual app_configs, matching production behavior exactly).
func newTestOrderService(t *testing.T, db *gorm.DB) *OrderService {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	redisURL := os.Getenv("REDIS_URL")
	if redisURL == "" {
		redisURL = "redis://localhost:6379/0"
	}
	redisClient, err := config.NewRedis(redisURL)
	if err != nil {
		t.Fatalf("connect redis: %v", err)
	}

	cache, err := config.NewCache(ctx, db, redisClient)
	if err != nil {
		t.Fatalf("build cache: %v", err)
	}

	currencySvc := currency.NewService(cache)
	hoursSvc := NewVendorHoursService(db)
	schedulingSvc := NewSchedulingService(db, hoursSvc)
	couponSvc := NewCouponService(db)
	// Notifications are nil in tests — OrderService checks for nil before
	// dispatching, and no OneSignal credentials exist in this environment.
	return NewOrderService(db, redisClient, cache, currencySvc, hoursSvc, schedulingSvc, nil, couponSvc)
}
