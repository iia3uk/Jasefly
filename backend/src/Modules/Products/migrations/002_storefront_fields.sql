-- Rich storefront fields for flexible product page templates.

ALTER TABLE `products` ADD COLUMN `badge` VARCHAR(120) NULL DEFAULT NULL AFTER `sku`;
ALTER TABLE `products` ADD COLUMN `sold_count` INT UNSIGNED NOT NULL DEFAULT 0 AFTER `stock`;
ALTER TABLE `products` ADD COLUMN `video_url` VARCHAR(500) NULL DEFAULT NULL AFTER `media_id`;
ALTER TABLE `products` ADD COLUMN `attrs` JSON NULL AFTER `description`;
ALTER TABLE `products` ADD COLUMN `variants` JSON NULL AFTER `attrs`;
ALTER TABLE `products` ADD COLUMN `gallery` JSON NULL AFTER `variants`;
ALTER TABLE `products` ADD COLUMN `tabs` JSON NULL AFTER `gallery`;
ALTER TABLE `products` ADD COLUMN `tags` JSON NULL AFTER `tabs`;
