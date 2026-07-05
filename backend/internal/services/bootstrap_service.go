package services

import (
	"context"
	"fmt"
	"log"
	"time"

	"gorm.io/gorm"

	"meryata-souq/backend/internal/models"
	"meryata-souq/backend/internal/pkg/phone"
	"meryata-souq/backend/internal/pkg/security"
)

// BootstrapSuperAdmin creates the first super_admin account from
// SEED_ADMIN_PHONE/SEED_ADMIN_PASSWORD env vars, if set and no super_admin
// exists yet. Idempotent and safe to leave the env vars set permanently —
// it no-ops once any super_admin row exists. There is no HTTP path to
// create a super_admin (blueprint has no such route), so this is the only
// bootstrap mechanism.
func BootstrapSuperAdmin(ctx context.Context, db *gorm.DB, seedPhone, seedPassword string) error {
	if seedPhone == "" || seedPassword == "" {
		return nil
	}

	var count int64
	if err := db.WithContext(ctx).Model(&models.User{}).
		Where("role = ?", models.RoleSuperAdmin).
		Count(&count).Error; err != nil {
		return fmt.Errorf("bootstrap: count super_admins: %w", err)
	}
	if count > 0 {
		return nil
	}

	normalized, ok := phone.Normalize(seedPhone)
	if !ok {
		return fmt.Errorf("bootstrap: SEED_ADMIN_PHONE is not a valid phone number")
	}
	if len(seedPassword) < 8 {
		return fmt.Errorf("bootstrap: SEED_ADMIN_PASSWORD must be at least 8 characters")
	}

	passwordHash, err := security.HashPassword(seedPassword)
	if err != nil {
		return fmt.Errorf("bootstrap: hash seed admin password: %w", err)
	}

	admin := models.User{
		ID:            newUUID(),
		Phone:         normalized,
		PhoneVerified: true,
		PasswordHash:  &passwordHash,
		Role:          models.RoleSuperAdmin,
		IsActive:      true,
		CreatedAt:     time.Now(),
		UpdatedAt:     time.Now(),
	}
	if err := db.WithContext(ctx).Create(&admin).Error; err != nil {
		return fmt.Errorf("bootstrap: create seed super_admin: %w", err)
	}

	log.Printf("bootstrap: created initial super_admin for phone %s", normalized)
	return nil
}
