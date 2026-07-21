-- Webhooks integration plugin: outbound webhook subscriptions.
-- Tracked as "plugin:Webhooks:001_create_webhooks.sql" in _migrations.

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
