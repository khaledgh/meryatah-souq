package config

import (
	"context"
	"fmt"

	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

// NewDatabase opens a GORM/Postgres connection using the given DSN.
func NewDatabase(databaseURL string) (*gorm.DB, error) {
	db, err := gorm.Open(postgres.Open(databaseURL), &gorm.Config{
		Logger: logger.Default.LogMode(logger.Warn),
	})
	if err != nil {
		return nil, fmt.Errorf("config: connect postgres: %w", err)
	}
	return db, nil
}

// EnsurePostGIS confirms the postgis extension is enabled, creating it if
// necessary. Migrations also issue CREATE EXTENSION IF NOT EXISTS, but this
// lets the health check assert PostGIS is actually active at runtime.
func EnsurePostGIS(ctx context.Context, db *gorm.DB) error {
	if err := db.WithContext(ctx).Exec(`CREATE EXTENSION IF NOT EXISTS postgis`).Error; err != nil {
		return fmt.Errorf("config: enable postgis extension: %w", err)
	}
	return nil
}

// PostGISEnabled reports whether the postgis extension is currently active.
func PostGISEnabled(ctx context.Context, db *gorm.DB) (bool, error) {
	var count int64
	if err := db.WithContext(ctx).
		Raw(`SELECT count(*) FROM pg_extension WHERE extname = 'postgis'`).
		Scan(&count).Error; err != nil {
		return false, fmt.Errorf("config: check postgis extension: %w", err)
	}
	return count > 0, nil
}

// PingDatabase verifies the connection is alive.
func PingDatabase(ctx context.Context, db *gorm.DB) error {
	sqlDB, err := db.DB()
	if err != nil {
		return fmt.Errorf("config: get sql.DB: %w", err)
	}
	if err := sqlDB.PingContext(ctx); err != nil {
		return fmt.Errorf("config: ping postgres: %w", err)
	}
	return nil
}
