-- Maps module defaults (provider, locale, center, fallback copy)
CREATE TABLE IF NOT EXISTS `maps_settings` (
  `id` TINYINT UNSIGNED NOT NULL PRIMARY KEY DEFAULT 1,
  `provider` VARCHAR(64) NOT NULL DEFAULT 'osm',
  `api_key` VARCHAR(255) NOT NULL DEFAULT '',
  `locale` VARCHAR(16) NOT NULL DEFAULT 'ru',
  `map_style` VARCHAR(64) NOT NULL DEFAULT 'default',
  `default_lat` DECIMAL(10,7) NOT NULL DEFAULT 55.7558000,
  `default_lng` DECIMAL(10,7) NOT NULL DEFAULT 37.6173000,
  `default_zoom` TINYINT UNSIGNED NOT NULL DEFAULT 12,
  `fallback_title` VARCHAR(190) NOT NULL DEFAULT 'Карта недоступна',
  `fallback_hint` VARCHAR(500) NOT NULL DEFAULT 'Не удалось загрузить карту. Откройте маршрут во внешнем сервисе.',
  `updated_at` DATETIME NULL,
  `created_at` DATETIME NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `maps_settings` (`id`, `provider`, `locale`, `default_lat`, `default_lng`, `default_zoom`, `created_at`, `updated_at`)
SELECT 1, 'osm', 'ru', 55.7558000, 37.6173000, 12, NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM `maps_settings` WHERE `id` = 1);
