-- Cookie Consent settings + audit log
CREATE TABLE IF NOT EXISTS `cookie_consent_settings` (
  `id` TINYINT UNSIGNED NOT NULL PRIMARY KEY DEFAULT 1,
  `enabled` TINYINT(1) NOT NULL DEFAULT 1,
  `policy_version` VARCHAR(32) NOT NULL DEFAULT '1',
  `policy_href` VARCHAR(255) NOT NULL DEFAULT '/privacy',
  `banner_title` VARCHAR(255) NOT NULL DEFAULT 'Файлы cookie',
  `banner_text` TEXT NULL,
  `modal_text` TEXT NULL,
  `categories_json` JSON NULL,
  `providers_json` JSON NULL,
  `show_floating_widget` TINYINT(1) NOT NULL DEFAULT 1,
  `log_retention_days` INT UNSIGNED NOT NULL DEFAULT 365,
  `created_at` DATETIME NULL,
  `updated_at` DATETIME NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `cookie_consent_log` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `visitor_key` VARCHAR(64) NOT NULL DEFAULT '',
  `source` VARCHAR(32) NOT NULL DEFAULT 'banner',
  `policy_version` VARCHAR(32) NOT NULL DEFAULT '1',
  `categories_json` JSON NULL,
  `user_agent` VARCHAR(512) NULL,
  `ip_hash` VARCHAR(64) NULL,
  `created_at` DATETIME NOT NULL,
  KEY `idx_cookie_consent_log_created` (`created_at`),
  KEY `idx_cookie_consent_log_source` (`source`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `cookie_consent_settings` (
  `id`, `enabled`, `policy_version`, `policy_href`, `banner_title`, `banner_text`, `modal_text`,
  `categories_json`, `providers_json`, `show_floating_widget`, `log_retention_days`, `created_at`, `updated_at`
)
SELECT
  1, 1, '1', '/privacy', 'Файлы cookie',
  'Мы используем необходимые cookie для работы сайта. Аналитика и маркетинг — только с вашего согласия.',
  'Выберите категории cookie. Необходимые всегда включены — без них сайт не работает.',
  JSON_ARRAY(
    JSON_OBJECT('id', 'necessary', 'label', 'Необходимые', 'description', 'Авторизация, безопасность, выбранные настройки', 'required', true, 'default', true),
    JSON_OBJECT('id', 'analytics', 'label', 'Аналитика', 'description', 'Счётчики посещаемости и улучшения сайта', 'required', false, 'default', false),
    JSON_OBJECT('id', 'marketing', 'label', 'Маркетинг', 'description', 'Реклама и ретаргетинг', 'required', false, 'default', false)
  ),
  JSON_ARRAY(),
  1, 365, NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM `cookie_consent_settings` WHERE `id` = 1);
