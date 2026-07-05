// Package storage will hold the Storage interface (Put/URL/Delete) plus
// local and S3 drivers, switchable at runtime via app_configs.storage_driver
// and validated per the §5.9 upload pipeline. Built in Phase 4 (blueprint
// §4.4, §15 item 4).
package storage
