-- AI Content Optimizer module tables

CREATE TABLE IF NOT EXISTS `ai_aco_settings` (
  `id` TINYINT UNSIGNED NOT NULL PRIMARY KEY DEFAULT 1,
  `api_keys` LONGTEXT NULL,
  `models` LONGTEXT NULL,
  `proxy_host` VARCHAR(255) NULL,
  `proxy_port` INT UNSIGNED NULL,
  `proxy_user` VARCHAR(120) NULL,
  `proxy_pass` VARCHAR(255) NULL,
  `default_prompt` LONGTEXT NULL,
  `cron_enabled` TINYINT(1) NOT NULL DEFAULT 0,
  `batch_size` INT UNSIGNED NOT NULL DEFAULT 1,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `ai_aco_profiles` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(160) NOT NULL,
  `content_type` VARCHAR(40) NOT NULL DEFAULT 'blog',
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `prompt` LONGTEXT NULL,
  `fields_json` JSON NULL,
  `title_mode` VARCHAR(20) NOT NULL DEFAULT 'keep',
  `protect_slug` TINYINT(1) NOT NULL DEFAULT 1,
  `min_chars` INT UNSIGNED NOT NULL DEFAULT 400,
  `min_growth_pct` INT NOT NULL DEFAULT 0,
  `require_preserve` TINYINT(1) NOT NULL DEFAULT 1,
  `append_updated_note` TINYINT(1) NOT NULL DEFAULT 1,
  `batch_limit` INT UNSIGNED NOT NULL DEFAULT 5,
  `interval_hours` INT UNSIGNED NOT NULL DEFAULT 24,
  `last_run_at` DATETIME NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_ai_aco_profiles_type` (`content_type`, `is_active`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `ai_aco_cursors` (
  `profile_id` INT UNSIGNED NOT NULL,
  `last_content_id` INT UNSIGNED NOT NULL DEFAULT 0,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`profile_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `ai_aco_backups` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `profile_id` INT UNSIGNED NULL,
  `content_type` VARCHAR(40) NOT NULL,
  `content_id` INT UNSIGNED NOT NULL,
  `content_title` VARCHAR(255) NULL,
  `before_json` LONGTEXT NOT NULL,
  `after_json` LONGTEXT NULL,
  `model_used` VARCHAR(120) NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_ai_aco_backups_item` (`content_type`, `content_id`),
  KEY `idx_ai_aco_backups_created` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `ai_aco_log` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `profile_id` INT UNSIGNED NULL,
  `content_type` VARCHAR(40) NOT NULL,
  `content_id` INT UNSIGNED NOT NULL,
  `content_title` VARCHAR(255) NULL,
  `status` VARCHAR(20) NOT NULL DEFAULT 'ok',
  `model_used` VARCHAR(120) NULL,
  `message` TEXT NULL,
  `backup_id` INT UNSIGNED NULL,
  `public_url` VARCHAR(500) NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_ai_aco_log_created` (`created_at`),
  KEY `idx_ai_aco_log_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO `ai_aco_settings` (`id`, `api_keys`, `models`, `default_prompt`, `cron_enabled`, `batch_size`)
SELECT 1, '',
'openrouter/free\nmeta-llama/llama-3.3-70b-instruct:free\ngoogle/gemini-2.0-flash-exp:free\nmistralai/mistral-small-3.1-24b-instruct:free',
'Ты SEO-редактор. Улучши и актуализируй материал на русском языке, сохранив тему и факты. Сделай текст подробнее, структурируй абзацами и подзаголовками (HTML: <p>, <h2>, <ul><li>). Не выдумывай контакты и цифры. Верни ТОЛЬКО JSON-объект с ключами: title, excerpt, content, seo_title, seo_description, seo_keywords (строки). content — HTML.',
0, 1
WHERE NOT EXISTS (SELECT 1 FROM `ai_aco_settings` WHERE id=1);

INSERT INTO `ai_aco_profiles` (
  `name`, `content_type`, `is_active`, `prompt`, `fields_json`, `title_mode`, `protect_slug`,
  `min_chars`, `min_growth_pct`, `require_preserve`, `append_updated_note`, `batch_limit`, `interval_hours`
)
SELECT
  'Блог — SEO-рерайт',
  'blog',
  1,
  NULL,
  '{"content":true,"excerpt":true,"seo_title":true,"seo_description":true,"seo_keywords":true,"title":true}',
  'if_better',
  1, 500, 5, 1, 1, 3, 24
WHERE NOT EXISTS (SELECT 1 FROM `ai_aco_profiles` LIMIT 1);
