-- IndexNow settings + submission log
CREATE TABLE IF NOT EXISTS `indexnow_settings` (
  `id` TINYINT UNSIGNED NOT NULL PRIMARY KEY DEFAULT 1,
  `api_key` VARCHAR(128) NOT NULL DEFAULT '',
  `host` VARCHAR(255) NOT NULL DEFAULT '',
  `endpoints_json` JSON NULL,
  `auto_submit` TINYINT(1) NOT NULL DEFAULT 1,
  `key_file_ok` TINYINT(1) NOT NULL DEFAULT 0,
  `updated_at` DATETIME NULL,
  `created_at` DATETIME NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `indexnow_log` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `endpoint` VARCHAR(255) NOT NULL DEFAULT '',
  `http_status` INT NOT NULL DEFAULT 0,
  `url_count` INT UNSIGNED NOT NULL DEFAULT 0,
  `urls_json` JSON NULL,
  `response_body` TEXT NULL,
  `ok` TINYINT(1) NOT NULL DEFAULT 0,
  `source` VARCHAR(64) NOT NULL DEFAULT 'manual',
  `created_at` DATETIME NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `indexnow_settings` (`id`, `api_key`, `host`, `endpoints_json`, `auto_submit`, `created_at`, `updated_at`)
SELECT 1, '', '', JSON_ARRAY('https://yandex.com/indexnow', 'https://api.indexnow.org/indexnow'), 1, NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM `indexnow_settings` WHERE `id` = 1);
