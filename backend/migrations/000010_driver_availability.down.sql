DROP INDEX IF EXISTS idx_users_driver_online;
ALTER TABLE users DROP COLUMN IF EXISTS is_online;
