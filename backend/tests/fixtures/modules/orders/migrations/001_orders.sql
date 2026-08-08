-- Orders domain extends the Payments-owned orders table.
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
  UNIQUE KEY `uniq_orders_number` (`number`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

ALTER TABLE `orders` ADD COLUMN `public_id` CHAR(26) NULL;
ALTER TABLE `orders` ADD COLUMN `user_id` BIGINT UNSIGNED NULL;
ALTER TABLE `orders` ADD COLUMN `email` VARCHAR(255) NULL;
ALTER TABLE `orders` ADD COLUMN `subtotal` DECIMAL(12,2) NOT NULL DEFAULT 0;
ALTER TABLE `orders` ADD COLUMN `discount_total` DECIMAL(12,2) NOT NULL DEFAULT 0;
ALTER TABLE `orders` ADD COLUMN `tax_total` DECIMAL(12,2) NOT NULL DEFAULT 0;
ALTER TABLE `orders` ADD COLUMN `shipping_total` DECIMAL(12,2) NOT NULL DEFAULT 0;
ALTER TABLE `orders` ADD COLUMN `grand_total` DECIMAL(12,2) NOT NULL DEFAULT 0;
ALTER TABLE `orders` ADD COLUMN `payment_status` VARCHAR(32) NOT NULL DEFAULT 'unpaid';
ALTER TABLE `orders` ADD COLUMN `fulfillment_status` VARCHAR(32) NOT NULL DEFAULT 'unfulfilled';
ALTER TABLE `orders` ADD COLUMN `source` VARCHAR(64) NOT NULL DEFAULT 'checkout';
ALTER TABLE `orders` ADD COLUMN `metadata` JSON NULL;
ALTER TABLE `orders` ADD COLUMN `note` TEXT NULL;
ALTER TABLE `orders` ADD UNIQUE KEY `uq_orders_public_id` (`public_id`);
UPDATE `orders` SET
  `public_id`=COALESCE(`public_id`,LOWER(SUBSTRING(REPLACE(UUID(),'-',''),1,26))),
  `email`=COALESCE(`email`,`customer_email`),
  `subtotal`=IF(`subtotal`=0,`amount`,`subtotal`),
  `grand_total`=IF(`grand_total`=0,`amount`,`grand_total`),
  `payment_status`=CASE WHEN `status` IN ('paid','processing','shipped','completed') THEN 'paid' ELSE `payment_status` END;

CREATE TABLE IF NOT EXISTS `carts` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `public_id` CHAR(26) NOT NULL,
  `user_id` BIGINT UNSIGNED NULL,
  `email` VARCHAR(255) NULL,
  `currency` VARCHAR(8) NOT NULL DEFAULT 'RUB',
  `status` VARCHAR(24) NOT NULL DEFAULT 'active',
  `metadata` JSON NULL,
  `expires_at` DATETIME NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY `uq_carts_public_id` (`public_id`),
  KEY `idx_carts_user_status` (`user_id`, `status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `cart_items` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `cart_id` BIGINT UNSIGNED NOT NULL,
  `product_id` BIGINT UNSIGNED NULL,
  `sku` VARCHAR(100) NULL,
  `title` VARCHAR(255) NOT NULL,
  `quantity` INT UNSIGNED NOT NULL DEFAULT 1,
  `unit_price` DECIMAL(12,2) NOT NULL DEFAULT 0,
  `metadata` JSON NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY `idx_cart_items_cart` (`cart_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `order_items` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `order_id` BIGINT UNSIGNED NOT NULL,
  `product_id` BIGINT UNSIGNED NULL,
  `sku` VARCHAR(100) NULL,
  `title` VARCHAR(255) NOT NULL,
  `quantity` INT UNSIGNED NOT NULL DEFAULT 1,
  `unit_price` DECIMAL(12,2) NOT NULL DEFAULT 0,
  `total` DECIMAL(12,2) NOT NULL DEFAULT 0,
  `metadata` JSON NULL,
  KEY `idx_order_items_order` (`order_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `order_addresses` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `order_id` BIGINT UNSIGNED NOT NULL,
  `type` VARCHAR(20) NOT NULL DEFAULT 'shipping',
  `name` VARCHAR(200) NULL, `phone` VARCHAR(80) NULL,
  `country` VARCHAR(2) NULL, `region` VARCHAR(160) NULL, `city` VARCHAR(160) NULL,
  `postal_code` VARCHAR(32) NULL, `line1` VARCHAR(255) NULL, `line2` VARCHAR(255) NULL,
  KEY `idx_order_addresses_order` (`order_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `order_status_history` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `order_id` BIGINT UNSIGNED NOT NULL,
  `from_status` VARCHAR(40) NULL,
  `to_status` VARCHAR(40) NOT NULL,
  `actor_id` BIGINT UNSIGNED NULL,
  `note` TEXT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY `idx_order_history_order` (`order_id`, `created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `order_notes` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `order_id` BIGINT UNSIGNED NOT NULL,
  `author_id` BIGINT UNSIGNED NULL,
  `body` TEXT NOT NULL,
  `is_customer_visible` TINYINT(1) NOT NULL DEFAULT 0,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY `idx_order_notes_order` (`order_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `coupons` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `code` VARCHAR(80) NOT NULL,
  `type` VARCHAR(16) NOT NULL DEFAULT 'fixed',
  `value` DECIMAL(12,2) NOT NULL DEFAULT 0,
  `currency` VARCHAR(8) NULL,
  `minimum_amount` DECIMAL(12,2) NOT NULL DEFAULT 0,
  `usage_limit` INT UNSIGNED NULL,
  `used_count` INT UNSIGNED NOT NULL DEFAULT 0,
  `starts_at` DATETIME NULL, `ends_at` DATETIME NULL,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY `uq_coupons_code` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `coupon_redemptions` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `coupon_id` BIGINT UNSIGNED NOT NULL,
  `order_id` BIGINT UNSIGNED NOT NULL,
  `user_id` BIGINT UNSIGNED NULL,
  `discount_amount` DECIMAL(12,2) NOT NULL DEFAULT 0,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY `uq_coupon_order` (`coupon_id`, `order_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `refunds` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `public_id` CHAR(26) NOT NULL,
  `order_id` BIGINT UNSIGNED NOT NULL,
  `payment_id` BIGINT UNSIGNED NULL,
  `amount` DECIMAL(12,2) NOT NULL,
  `currency` VARCHAR(8) NOT NULL DEFAULT 'RUB',
  `status` VARCHAR(24) NOT NULL DEFAULT 'recorded',
  `reason` TEXT NULL,
  `created_by` BIGINT UNSIGNED NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY `uq_refunds_public_id` (`public_id`),
  KEY `idx_refunds_order` (`order_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO `permissions` (`slug`, `name`, `group_name`) VALUES
('orders.view', 'View orders', 'orders'),
('orders.manage', 'Manage orders', 'orders'),
('orders.refund', 'Record order refunds', 'orders'),
('orders.export', 'Export orders', 'orders');
INSERT IGNORE INTO `role_permissions` (`role_id`, `permission_id`)
SELECT r.id, p.id FROM `roles` r JOIN `permissions` p ON p.slug IN ('orders.view','orders.manage','orders.refund','orders.export')
WHERE r.slug IN ('admin','super_admin');
INSERT IGNORE INTO `modules` (`name`, `is_enabled`, `settings`) VALUES ('orders', 0, NULL);
