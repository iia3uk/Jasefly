-- Scheduler / background jobs (shared-hosting friendly)

CREATE TABLE IF NOT EXISTS `scheduled_jobs` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `type` VARCHAR(120) NOT NULL,
  `payload` LONGTEXT NULL,
  `queue` VARCHAR(64) NOT NULL DEFAULT 'default',
  `priority` INT NOT NULL DEFAULT 0,
  `status` VARCHAR(32) NOT NULL DEFAULT 'pending',
  `available_at` DATETIME NOT NULL,
  `started_at` DATETIME NULL,
  `finished_at` DATETIME NULL,
  `attempts` INT UNSIGNED NOT NULL DEFAULT 0,
  `max_attempts` INT UNSIGNED NOT NULL DEFAULT 5,
  `last_error` TEXT NULL,
  `deduplication_key` VARCHAR(190) NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_jobs_claim` (`status`, `available_at`, `priority`, `id`),
  KEY `idx_jobs_queue` (`queue`, `status`),
  KEY `idx_jobs_type` (`type`),
  UNIQUE KEY `uq_jobs_dedupe` (`deduplication_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `job_attempts` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `job_id` BIGINT UNSIGNED NOT NULL,
  `attempt` INT UNSIGNED NOT NULL,
  `status` VARCHAR(32) NOT NULL,
  `error` TEXT NULL,
  `duration_ms` INT UNSIGNED NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_job_attempts_job` (`job_id`, `id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `cron_schedules` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(120) NOT NULL,
  `expression` VARCHAR(64) NOT NULL DEFAULT '*/5 * * * *',
  `job_type` VARCHAR(120) NOT NULL,
  `payload` LONGTEXT NULL,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `last_run_at` DATETIME NULL,
  `next_run_at` DATETIME NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_cron_name` (`name`),
  KEY `idx_cron_next` (`is_active`, `next_run_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `scheduler_meta` (
  `meta_key` VARCHAR(64) NOT NULL,
  `meta_value` TEXT NULL,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`meta_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO `scheduler_meta` (`meta_key`, `meta_value`) VALUES
('last_tick_at', NULL),
('tick_token_hash', NULL);

INSERT IGNORE INTO `permissions` (`slug`, `name`, `group_name`) VALUES
('scheduler.view', 'View scheduler jobs', 'scheduler'),
('scheduler.manage', 'Manage scheduler jobs', 'scheduler');

INSERT IGNORE INTO `role_permissions` (`role_id`, `permission_id`)
SELECT r.id, p.id FROM `roles` r
INNER JOIN `permissions` p ON p.slug IN ('scheduler.view', 'scheduler.manage')
WHERE r.slug IN ('admin', 'super_admin');

INSERT IGNORE INTO `modules` (`name`, `is_enabled`, `settings`) VALUES
('scheduler', 1, NULL);
