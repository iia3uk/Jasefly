-- Cookie consent banner settings on site_settings.

ALTER TABLE `site_settings`
  ADD COLUMN `cookie_banner_enabled` TINYINT(1) NOT NULL DEFAULT 1 AFTER `projects_per_page`,
  ADD COLUMN `cookie_banner_text` VARCHAR(500) NULL DEFAULT 'Мы используем cookies для работы сайта и аналитики. Подробнее — в политике конфиденциальности.' AFTER `cookie_banner_enabled`,
  ADD COLUMN `cookie_policy_href` VARCHAR(255) NULL DEFAULT '/privacy' AFTER `cookie_banner_text`;
