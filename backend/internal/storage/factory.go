package storage

import (
	"context"
	"fmt"

	"meryata-souq/backend/internal/config"
)

// Registry resolves the active Storage driver by name, mirroring how
// otp.Registry resolves the active OTP provider — the driver named in a
// stored file's own storage_driver column is looked up here at read time,
// so switching app_configs.storage_driver never breaks previously
// uploaded files (blueprint §4.4).
type Registry struct {
	drivers map[string]Storage
}

func NewRegistry(local *LocalStorage, s3 *S3Storage) *Registry {
	drivers := map[string]Storage{
		DriverLocal: local,
	}
	if s3 != nil {
		drivers[DriverS3] = s3
	}
	return &Registry{drivers: drivers}
}

func (r *Registry) Resolve(driverName string) (Storage, error) {
	d, ok := r.drivers[driverName]
	if !ok {
		return nil, fmt.Errorf("storage: unknown or unconfigured driver %q", driverName)
	}
	return d, nil
}

// ActiveDriverName reads the currently configured driver from the config
// cache (app_configs.storage_driver), defaulting to local if unset.
func ActiveDriverName(cache *config.Cache) string {
	if name, ok := cache.AppConfigString("storage_driver"); ok && name != "" {
		return name
	}
	return DriverLocal
}

// Resolve is a convenience combining ActiveDriverName + Resolve for
// callers writing a brand-new file (which should always go to the
// currently active driver, not a per-file stored one).
func (r *Registry) ResolveActive(ctx context.Context, cache *config.Cache) (driverName string, s Storage, err error) {
	driverName = ActiveDriverName(cache)
	s, err = r.Resolve(driverName)
	return driverName, s, err
}
