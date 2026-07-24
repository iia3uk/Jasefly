-- In-app and optional external notifications
CREATE TABLE IF NOT EXISTS `notifications` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` INT UNSIGNED NULL,
  `type` VARCHAR(100) NOT NULL,
  `title` VARCHAR(255) NOT NULL,
  `body` TEXT NULL,
  `action_url` VARCHAR(1024) NULL,
  `icon` VARCHAR(80) NULL,
  `priority` VARCHAR(20) NOT NULL DEFAULT 'normal',
  `is_read` TINYINT(1) NOT NULL DEFAULT 0,
  `dedupe_key` VARCHAR(190) NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_notifications_dedupe` (`user_id`, `dedupe_key`),
  KEY `idx_notifications_user` (`user_id`, `is_read`, `id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS `notification_templates` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT, `type` VARCHAR(100) NOT NULL,
  `channel` VARCHAR(30) NOT NULL DEFAULT 'browser', `subject` VARCHAR(255) NULL,
  `body` LONGTEXT NOT NULL, `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`), UNIQUE KEY `uq_notification_template` (`type`,`channel`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS `notification_deliveries` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, `notification_id` BIGINT UNSIGNED NOT NULL,
  `channel` VARCHAR(30) NOT NULL, `recipient` VARCHAR(255) NULL, `status` VARCHAR(24) NOT NULL,
  `error` TEXT NULL, `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`), KEY `idx_notification_deliveries` (`notification_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS `notification_preferences` (
  `user_id` INT UNSIGNED NOT NULL, `channel` VARCHAR(30) NOT NULL,
  `is_enabled` TINYINT(1) NOT NULL DEFAULT 1, `types` JSON NULL,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`user_id`,`channel`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
INSERT IGNORE INTO `permissions` (`slug`,`name`,`group_name`) VALUES
('notifications.view','View notifications','notifications'),
('notifications.manage','Manage notifications','notifications');
INSERT IGNORE INTO `role_permissions` (`role_id`,`permission_id`)
SELECT r.id,p.id FROM `roles` r JOIN `permissions` p ON p.slug IN
('notifications.view','notifications.manage') WHERE r.slug IN ('admin','super_admin');
INSERT IGNORE INTO `modules` (`name`,`is_enabled`,`settings`) VALUES ('notifications',0,NULL);
