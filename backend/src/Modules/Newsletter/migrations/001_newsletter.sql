-- Newsletter audiences and campaigns
CREATE TABLE IF NOT EXISTS `subscribers` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, `email` VARCHAR(320) NOT NULL, `name` VARCHAR(200) NULL,
  `status` VARCHAR(24) NOT NULL DEFAULT 'pending', `source` VARCHAR(120) NULL,
  `confirm_token_hash` CHAR(64) NULL, `confirmed_at` DATETIME NULL, `unsubscribed_at` DATETIME NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`), UNIQUE KEY `uq_subscribers_email` (`email`), KEY `idx_subscribers_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS `subscriber_lists` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT, `name` VARCHAR(200) NOT NULL, `description` TEXT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS `subscriber_list_members` (
  `list_id` INT UNSIGNED NOT NULL, `subscriber_id` BIGINT UNSIGNED NOT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (`list_id`,`subscriber_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS `subscriber_tags` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT, `name` VARCHAR(100) NOT NULL, PRIMARY KEY (`id`), UNIQUE KEY (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS `subscriber_tag_links` (
  `tag_id` INT UNSIGNED NOT NULL, `subscriber_id` BIGINT UNSIGNED NOT NULL, PRIMARY KEY (`tag_id`,`subscriber_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS `newsletter_templates` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT, `name` VARCHAR(200) NOT NULL, `subject` VARCHAR(255) NOT NULL,
  `html` LONGTEXT NOT NULL, `text_body` LONGTEXT NULL, `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS `newsletter_campaigns` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, `name` VARCHAR(200) NOT NULL, `subject` VARCHAR(255) NOT NULL,
  `html` LONGTEXT NOT NULL, `text_body` LONGTEXT NULL, `list_id` INT UNSIGNED NULL,
  `status` VARCHAR(24) NOT NULL DEFAULT 'draft', `scheduled_at` DATETIME NULL,
  `sent_count` INT UNSIGNED NOT NULL DEFAULT 0, `created_by` INT UNSIGNED NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`), KEY `idx_campaign_status` (`status`,`scheduled_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS `newsletter_deliveries` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, `campaign_id` BIGINT UNSIGNED NOT NULL,
  `subscriber_id` BIGINT UNSIGNED NOT NULL, `status` VARCHAR(24) NOT NULL DEFAULT 'pending',
  `error` TEXT NULL, `sent_at` DATETIME NULL, `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`), UNIQUE KEY `uq_campaign_subscriber` (`campaign_id`,`subscriber_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS `newsletter_events` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, `delivery_id` BIGINT UNSIGNED NULL,
  `event_type` VARCHAR(40) NOT NULL, `meta` JSON NULL, `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`), KEY `idx_newsletter_events` (`delivery_id`,`event_type`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS `suppression_list` (
  `email` VARCHAR(320) NOT NULL, `reason` VARCHAR(120) NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
INSERT IGNORE INTO `permissions` (`slug`,`name`,`group_name`) VALUES
('newsletter.view','View newsletter','newsletter'),('newsletter.manage','Manage newsletter','newsletter'),
('newsletter.send','Send campaigns','newsletter'),('newsletter.subscribers.manage','Manage subscribers','newsletter');
INSERT IGNORE INTO `role_permissions` (`role_id`,`permission_id`)
SELECT r.id,p.id FROM `roles` r JOIN `permissions` p ON p.slug LIKE 'newsletter.%'
WHERE r.slug IN ('admin','super_admin');
INSERT IGNORE INTO `modules` (`name`,`is_enabled`,`settings`) VALUES ('newsletter',0,NULL);
