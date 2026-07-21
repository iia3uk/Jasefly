-- Техобслуживание: текст для гостей + доступ staff
ALTER TABLE `site_settings` ADD COLUMN `maintenance_title` VARCHAR(200) NULL;
ALTER TABLE `site_settings` ADD COLUMN `maintenance_message` TEXT NULL;
ALTER TABLE `site_settings` ADD COLUMN `maintenance_allow_staff` TINYINT(1) NOT NULL DEFAULT 1;
