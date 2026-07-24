CREATE TABLE IF NOT EXISTS `analytics_sessions` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `session_hash` CHAR(64) NOT NULL,
  `visitor_hash` CHAR(64) NOT NULL,
  `first_seen_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `last_seen_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `landing_path` VARCHAR(1024) NULL,
  `referrer_host` VARCHAR(255) NULL,
  `user_agent_hash` CHAR(64) NULL,
  `events_count` INT UNSIGNED NOT NULL DEFAULT 0,
  UNIQUE KEY `uq_analytics_session_hash` (`session_hash`),
  KEY `idx_analytics_sessions_seen` (`last_seen_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `analytics_events` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `event_name` VARCHAR(64) NOT NULL,
  `session_id` BIGINT UNSIGNED NULL,
  `visitor_hash` CHAR(64) NOT NULL,
  `path` VARCHAR(1024) NULL,
  `target_type` VARCHAR(64) NULL,
  `target_id` VARCHAR(128) NULL,
  `value` DECIMAL(14,2) NULL,
  `currency` VARCHAR(8) NULL,
  `metadata` JSON NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY `idx_analytics_events_date` (`created_at`),
  KEY `idx_analytics_events_name_date` (`event_name`,`created_at`),
  KEY `idx_analytics_events_session` (`session_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `analytics_daily_stats` (
  `stat_date` DATE NOT NULL,
  `event_name` VARCHAR(64) NOT NULL,
  `path` VARCHAR(512) NOT NULL DEFAULT '',
  `events_count` BIGINT UNSIGNED NOT NULL DEFAULT 0,
  `unique_visitors` BIGINT UNSIGNED NOT NULL DEFAULT 0,
  `value_total` DECIMAL(16,2) NOT NULL DEFAULT 0,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`stat_date`,`event_name`,`path`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `analytics_goals` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `name` VARCHAR(160) NOT NULL,
  `event_name` VARCHAR(64) NOT NULL,
  `conditions` JSON NULL,
  `value` DECIMAL(14,2) NULL,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `analytics_goal_conversions` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `goal_id` BIGINT UNSIGNED NOT NULL,
  `event_id` BIGINT UNSIGNED NOT NULL,
  `session_id` BIGINT UNSIGNED NULL,
  `visitor_hash` CHAR(64) NOT NULL,
  `value` DECIMAL(14,2) NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY `uq_goal_event` (`goal_id`,`event_id`),
  KEY `idx_goal_conversions_date` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `analytics_settings` (
  `id` TINYINT UNSIGNED NOT NULL DEFAULT 1 PRIMARY KEY,
  `retention_days` INT UNSIGNED NOT NULL DEFAULT 365,
  `respect_dnt` TINYINT(1) NOT NULL DEFAULT 1,
  `collect_user_agent` TINYINT(1) NOT NULL DEFAULT 0,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
INSERT IGNORE INTO `analytics_settings` (`id`,`retention_days`,`respect_dnt`,`collect_user_agent`) VALUES (1,365,1,0);

INSERT IGNORE INTO `permissions` (`slug`,`name`,`group_name`) VALUES
('analytics.view','View analytics','analytics'),
('analytics.manage','Manage analytics','analytics');
INSERT IGNORE INTO `role_permissions` (`role_id`,`permission_id`)
SELECT r.id,p.id FROM `roles` r JOIN `permissions` p ON p.slug IN ('analytics.view','analytics.manage')
WHERE r.slug IN ('admin','super_admin');
INSERT IGNORE INTO `modules` (`name`,`is_enabled`,`settings`) VALUES ('analytics',0,NULL);
