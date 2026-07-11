-- Driver availability toggle (blueprint §11.D2): online/offline status
-- gates whether a driver appears in the available-orders match (§4.9,
-- §11.D3). Going offline never touches driver_locations — the last known
-- position is kept for admin/history purposes (see driver_location_service.go).
ALTER TABLE users
    ADD COLUMN is_online BOOLEAN NOT NULL DEFAULT false;

-- Partial index: only drivers are ever queried by is_online, and only the
-- online ones matter for matching, so index just that slice.
CREATE INDEX idx_users_driver_online ON users (id) WHERE role = 'driver' AND is_online = true;
