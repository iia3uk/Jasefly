-- Webhooks package: outbound webhook subscriptions.
-- IF NOT EXISTS — safe when table already exists from legacy bundled plugin migration.

CREATE TABLE IF NOT EXISTS `webhooks` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `event` VARCHAR(80) NOT NULL DEFAULT '*',
  `url` VARCHAR(500) NOT NULL,
  `secret` VARCHAR(255) NULL,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_webhooks_event` (`event`),
  INDEX `idx_webhooks_active` (`is_active`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
