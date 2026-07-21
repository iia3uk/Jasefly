-- Security: admin TOTP 2FA columns on users
ALTER TABLE users ADD COLUMN totp_secret VARCHAR(64) NULL AFTER password_hash;
ALTER TABLE users ADD COLUMN totp_enabled TINYINT(1) NOT NULL DEFAULT 0 AFTER totp_secret;
ALTER TABLE users ADD COLUMN totp_confirmed_at DATETIME NULL AFTER totp_enabled;
