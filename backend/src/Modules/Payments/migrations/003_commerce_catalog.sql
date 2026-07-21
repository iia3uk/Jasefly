-- Bind orders to catalog items (service / product).

ALTER TABLE `orders` ADD COLUMN `item_type` VARCHAR(32) NULL DEFAULT NULL AFTER `items`;
ALTER TABLE `orders` ADD COLUMN `item_id` INT UNSIGNED NULL DEFAULT NULL AFTER `item_type`;
ALTER TABLE `orders` ADD COLUMN `offer_accepted` TINYINT(1) NOT NULL DEFAULT 0 AFTER `item_id`;

CREATE INDEX `idx_orders_item` ON `orders` (`item_type`, `item_id`);
