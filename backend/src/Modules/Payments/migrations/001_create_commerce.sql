-- Payments integration plugin: orders + payments tables.
-- Tracked as "plugin:Payments:001_create_commerce.sql" in _migrations.

CREATE TABLE IF NOT EXISTS `orders` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `number` VARCHAR(80) NOT NULL,
  `customer_email` VARCHAR(255) NULL,
  `customer_name` VARCHAR(200) NULL,
  `amount` DECIMAL(12,2) NOT NULL DEFAULT 0,
  `currency` VARCHAR(8) NOT NULL DEFAULT 'RUB',
  `status` VARCHAR(40) NOT NULL DEFAULT 'new',
  `items` JSON NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE INDEX `uniq_orders_number` (`number`),
  INDEX `idx_orders_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `payments` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `provider` VARCHAR(40) NOT NULL,
  `external_id` VARCHAR(255) NOT NULL DEFAULT '',
  `order_id` BIGINT UNSIGNED NULL,
  `amount` DECIMAL(12,2) NOT NULL DEFAULT 0,
  `currency` VARCHAR(8) NOT NULL DEFAULT 'RUB',
  `status` VARCHAR(40) NOT NULL DEFAULT 'pending',
  `raw_payload` LONGTEXT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE INDEX `uniq_payments_provider_external` (`provider`, `external_id`),
  INDEX `idx_payments_status` (`status`),
  INDEX `idx_payments_order_id` (`order_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
