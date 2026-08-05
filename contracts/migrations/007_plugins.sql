-- Plugin state: enable/disable + per-plugin settings.
-- Backs the /admin/plugins management UI. A module is "on" when a row exists
-- here with is_enabled=1, OR when no row exists yet (defaults to enabled).

CREATE TABLE IF NOT EXISTS `modules` (
  `name` VARCHAR(80) NOT NULL PRIMARY KEY,
  `is_enabled` TINYINT(1) NOT NULL DEFAULT 1,
  `settings` JSON NULL,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
