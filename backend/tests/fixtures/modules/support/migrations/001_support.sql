-- Support tickets / live chat

CREATE TABLE IF NOT EXISTS `support_tickets` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `public_id` CHAR(32) NOT NULL,
  `status` VARCHAR(32) NOT NULL DEFAULT 'open',
  `visitor_key` VARCHAR(64) NOT NULL,
  `contact_email` VARCHAR(255) NULL,
  `contact_social` VARCHAR(255) NULL,
  `contact_social_type` VARCHAR(40) NULL,
  `user_agent` VARCHAR(512) NULL,
  `page_url` VARCHAR(1024) NULL,
  `last_visitor_seen_at` DATETIME NULL,
  `assigned_user_id` INT UNSIGNED NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_support_tickets_public` (`public_id`),
  KEY `idx_support_tickets_status` (`status`),
  KEY `idx_support_tickets_visitor` (`visitor_key`),
  KEY `idx_support_tickets_seen` (`last_visitor_seen_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `support_messages` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `ticket_id` BIGINT UNSIGNED NOT NULL,
  `sender` VARCHAR(16) NOT NULL,
  `user_id` INT UNSIGNED NULL,
  `body` TEXT NOT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_support_messages_ticket` (`ticket_id`, `id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `support_faq` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `question` VARCHAR(500) NOT NULL,
  `answer` TEXT NOT NULL,
  `keywords` VARCHAR(500) NULL,
  `sort_order` INT NOT NULL DEFAULT 0,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_support_faq_active` (`is_active`, `sort_order`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `support_agent_presence` (
  `user_id` INT UNSIGNED NOT NULL,
  `last_seen_at` DATETIME NOT NULL,
  PRIMARY KEY (`user_id`),
  KEY `idx_support_agent_seen` (`last_seen_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO `permissions` (`slug`, `name`, `group_name`) VALUES
('support.manage', 'Manage support settings & FAQ', 'support'),
('support.agent', 'Support agent inbox', 'support');

INSERT IGNORE INTO `role_permissions` (`role_id`, `permission_id`)
SELECT r.id, p.id FROM `roles` r
INNER JOIN `permissions` p ON p.slug IN ('support.manage', 'support.agent')
WHERE r.slug IN ('admin', 'super_admin');
