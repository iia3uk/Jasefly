-- MySQL-compatible (no ADD COLUMN IF NOT EXISTS — MariaDB-only syntax).
-- Re-runs ignore duplicate columns via ModuleMigrationService.
ALTER TABLE users ADD COLUMN email_verified_at DATETIME NULL;
ALTER TABLE users ADD COLUMN email_verify_token VARCHAR(64) NULL;
ALTER TABLE users ADD COLUMN email_verify_expires_at DATETIME NULL;
ALTER TABLE users ADD COLUMN registration_source VARCHAR(40) NULL;
INSERT IGNORE INTO roles (slug, name, description, is_system)
VALUES ('member', 'Member', 'Public self-registered user (no admin access).', 1);
