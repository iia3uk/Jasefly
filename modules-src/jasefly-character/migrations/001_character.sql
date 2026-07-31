CREATE TABLE IF NOT EXISTS `jasefly_character_settings` (
  `id` TINYINT UNSIGNED NOT NULL PRIMARY KEY DEFAULT 1,
  `enabled` TINYINT(1) NOT NULL DEFAULT 1,
  `show_on_landing` TINYINT(1) NOT NULL DEFAULT 1,
  `show_on_admin_welcome` TINYINT(1) NOT NULL DEFAULT 1,
  `show_on_module_ops` TINYINT(1) NOT NULL DEFAULT 1,
  `updated_at` DATETIME NULL,
  `created_at` DATETIME NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `jasefly_character_settings` (`id`, `enabled`, `show_on_landing`, `show_on_admin_welcome`, `show_on_module_ops`, `created_at`, `updated_at`)
SELECT 1, 1, 1, 1, 1, NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM `jasefly_character_settings` WHERE `id` = 1);
