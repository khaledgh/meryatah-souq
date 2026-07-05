// Command seed provisions one fully-populated test vendor for local
// development: an approved vendor with an owner user, 24/7 open hours, two
// categories, and a few products with stock/prices. It writes directly to
// the database (a seed legitimately has DB access — no need to drive the
// OTP/API flow) and is idempotent by phone: re-running removes the prior
// seed vendor for the same phone first.
//
// Run:  go run ./cmd/seed        (reads DATABASE_URL from .env / the env)
//
// After seeding it prints the vendor owner's phone. To log into web-vendor
// with it you still need an OTP code; in local dev the SMS provider is a
// no-op, so use the OTP helper or read the code from logs. The seed's main
// purpose is to give the vendor dashboard real data to display.
package main

import (
	"context"
	"fmt"
	"log"
	"time"

	"gorm.io/gorm"

	"meryata-souq/backend/internal/config"
)

const (
	seedPhone    = "+96176100100"
	seedVendorEN = "Demo Grocery"
	seedVendorAR = "بقالة تجريبية"
)

func main() {
	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("config: %v", err)
	}
	db, err := config.NewDatabase(cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("database: %v", err)
	}
	ctx := context.Background()
	now := time.Now()

	// Idempotency: drop any prior seed vendor + owner for this phone so a
	// re-run starts clean. Order matters for FKs (children first).
	var priorUserID string
	db.WithContext(ctx).Raw(`SELECT id FROM users WHERE phone = ?`, seedPhone).Scan(&priorUserID)
	if priorUserID != "" {
		var priorVendorID string
		db.WithContext(ctx).Raw(`SELECT id FROM vendors WHERE owner_user_id = ?`, priorUserID).Scan(&priorVendorID)
		if priorVendorID != "" {
			db.WithContext(ctx).Exec(`DELETE FROM product_images WHERE product_id IN (SELECT id FROM products WHERE vendor_id = ?)`, priorVendorID)
			db.WithContext(ctx).Exec(`DELETE FROM products WHERE vendor_id = ?`, priorVendorID)
			db.WithContext(ctx).Exec(`DELETE FROM categories WHERE vendor_id = ?`, priorVendorID)
			db.WithContext(ctx).Exec(`DELETE FROM vendor_hours WHERE vendor_id = ?`, priorVendorID)
			db.WithContext(ctx).Exec(`DELETE FROM vendor_applications WHERE created_vendor_id = ?`, priorVendorID)
			db.WithContext(ctx).Exec(`DELETE FROM vendors WHERE id = ?`, priorVendorID)
		}
		db.WithContext(ctx).Exec(`DELETE FROM refresh_tokens WHERE user_id = ?`, priorUserID)
		db.WithContext(ctx).Exec(`DELETE FROM users WHERE id = ?`, priorUserID)
	}

	userID := uuidV4(db)
	vendorID := uuidV4(db)

	// Owner user (role=vendor, phone verified, no password — logs in via OTP,
	// same model as approval-created owners).
	must(db.WithContext(ctx).Exec(`
		INSERT INTO users (id, phone, phone_verified, first_name, last_name, role, is_active, failed_logins, created_at, updated_at)
		VALUES (?, ?, true, 'Demo', 'Owner', 'vendor', true, 0, ?, ?)
	`, userID, seedPhone, now, now))

	// Vendor with a real location (Beirut) and USD display currency.
	must(db.WithContext(ctx).Exec(`
		INSERT INTO vendors (id, owner_user_id, name_i18n, category, location, address, timezone, display_currency, is_active, created_at)
		VALUES (?, ?, ?::jsonb, 'grocery', ST_SetSRID(ST_MakePoint(35.5018, 33.8938), 4326)::geography, 'Hamra, Beirut', 'Asia/Beirut', 'USD', true, ?)
	`, vendorID, userID, fmt.Sprintf(`{"en":%q,"ar":%q}`, seedVendorEN, seedVendorAR), now))

	// 24/7 open hours so the store shows Open and accepts ASAP orders.
	for day := 0; day < 7; day++ {
		must(db.WithContext(ctx).Exec(`
			INSERT INTO vendor_hours (id, vendor_id, day_of_week, open_time, close_time, is_closed)
			VALUES (?, ?, ?, '00:00:00', '23:59:00', false)
		`, uuidV4(db), vendorID, day))
	}

	// Two categories.
	drinksID := uuidV4(db)
	snacksID := uuidV4(db)
	must(db.WithContext(ctx).Exec(`INSERT INTO categories (id, vendor_id, name_i18n, sort_order) VALUES (?, ?, '{"en":"Drinks","ar":"مشروبات"}'::jsonb, 1)`, drinksID, vendorID))
	must(db.WithContext(ctx).Exec(`INSERT INTO categories (id, vendor_id, name_i18n, sort_order) VALUES (?, ?, '{"en":"Snacks","ar":"وجبات خفيفة"}'::jsonb, 2)`, snacksID, vendorID))

	// A handful of products.
	products := []struct {
		nameEN   string
		nameAR   string
		price    float64
		stock    int
		category string
	}{
		{"Cola 330ml", "كولا ٣٣٠ مل", 1.25, 200, drinksID},
		{"Sparkling Water", "مياه غازية", 0.90, 150, drinksID},
		{"Potato Chips", "رقائق بطاطا", 1.75, 80, snacksID},
		{"Chocolate Bar", "لوح شوكولاتة", 2.10, 60, snacksID},
	}
	for _, p := range products {
		must(db.WithContext(ctx).Exec(`
			INSERT INTO products (id, vendor_id, category_id, name_i18n, description_i18n, price_usd, stock, is_active, created_at)
			VALUES (?, ?, ?, ?::jsonb, '{"en":"Fresh and in stock."}'::jsonb, ?, ?, true, ?)
		`, uuidV4(db), vendorID, p.category, fmt.Sprintf(`{"en":%q,"ar":%q}`, p.nameEN, p.nameAR), p.price, p.stock, now))
	}

	fmt.Println("✓ Seeded demo vendor")
	fmt.Printf("  vendor_id: %s\n", vendorID)
	fmt.Printf("  owner phone (login to web-vendor with this): %s\n", seedPhone)
	fmt.Println("  categories: Drinks, Snacks · products: 4 · hours: open 24/7")
	fmt.Println("  Login: on web-vendor enter this phone, tap Send code, then read the")
	fmt.Println("  code from the backend log line: otp[dev]: code for … is XXXXXX")
	fmt.Println("  (the dev-only OTP log is active when APP_ENV=development).")
}

// uuidV4 generates a UUID via Postgres (uuid_generate_v4, already available
// from migration 000001's extension) so the seed adds no client-side UUID
// dependency.
func uuidV4(db *gorm.DB) string {
	var id string
	if err := db.Raw(`SELECT uuid_generate_v4()`).Scan(&id).Error; err != nil {
		log.Fatalf("seed: generate uuid: %v", err)
	}
	return id
}

func must(tx *gorm.DB) {
	if tx.Error != nil {
		log.Fatalf("seed: %v", tx.Error)
	}
}
