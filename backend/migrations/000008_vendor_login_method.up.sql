-- Admin-controlled vendor login method (blueprint §11.A10 system settings).
-- Global app_config selecting how vendor-role users authenticate:
--   "otp"      → vendors sign in via phone + OTP (default, current behavior)
--   "password" → vendors sign in via phone + password (admin sets the password)
-- Read by AuthService to gate the vendor login paths; editable from the
-- web-admin System Settings page like any other app_config.
INSERT INTO app_configs (key, value, description)
VALUES ('vendor_login_method', '"otp"', 'otp | password — how vendors sign in')
ON CONFLICT (key) DO NOTHING;
