// Package storage implements the pluggable file storage abstraction
// (blueprint §4.4): a local-disk driver and an S3 driver, switchable at
// runtime via app_configs.storage_driver. Every stored file records which
// driver it lives on (e.g. product_images.storage_driver) so switching the
// active driver never breaks previously uploaded files.
package storage

import (
	"context"
	"io"
	"time"
)

// Driver names as stored in app_configs.storage_driver and per-file
// storage_driver columns (blueprint §3.3, §4.4).
const (
	DriverLocal = "local"
	DriverS3    = "s3"
)

// Storage puts, serves, and deletes objects by key. Implementations must
// not trust the caller's key for path construction beyond what Put
// generates — callers should use RandomObjectKey to build keys (§5.9).
type Storage interface {
	// Put uploads content at key. contentType is stored/served as the
	// object's Content-Type.
	Put(ctx context.Context, key string, r io.Reader, contentType string) error

	// URL returns a time-limited URL to fetch the object: a presigned GET
	// URL for S3, or an authenticated served path for local. ttl is
	// advisory for local (the authenticated route itself gates access).
	URL(ctx context.Context, key string, ttl time.Duration) (string, error)

	// Delete removes the object. Deleting a non-existent key is not an
	// error.
	Delete(ctx context.Context, key string) error
}
