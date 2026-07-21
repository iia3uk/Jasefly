-- Commerce catalog: purchasable services (+ order line binding columns when orders exists).

ALTER TABLE `services` ADD COLUMN `price` DECIMAL(12,2) NULL DEFAULT NULL AFTER `price_label`;
ALTER TABLE `services` ADD COLUMN `currency` VARCHAR(8) NOT NULL DEFAULT 'RUB' AFTER `price`;
ALTER TABLE `services` ADD COLUMN `is_purchasable` TINYINT(1) NOT NULL DEFAULT 0 AFTER `currency`;
ALTER TABLE `services` ADD COLUMN `offer_text` TEXT NULL AFTER `is_purchasable`;
ALTER TABLE `services` ADD COLUMN `duration_label` VARCHAR(120) NULL AFTER `offer_text`;

CREATE INDEX `idx_services_purchasable` ON `services` (`is_purchasable`, `is_visible`);
