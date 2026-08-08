-- Comments package. IF NOT EXISTS / INSERT IGNORE — safe when legacy bundled migration already applied.

CREATE TABLE IF NOT EXISTS `comments` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `public_id` CHAR(26) NOT NULL,
  `type` VARCHAR(16) NOT NULL DEFAULT 'comment',
  `target_type` VARCHAR(32) NOT NULL,
  `target_id` BIGINT UNSIGNED NOT NULL,
  `parent_id` BIGINT UNSIGNED NULL,
  `user_id` BIGINT UNSIGNED NULL,
  `author_name` VARCHAR(200) NOT NULL,
  `author_email` VARCHAR(255) NULL,
  `body` TEXT NOT NULL,
  `rating` TINYINT UNSIGNED NULL,
  `status` VARCHAR(20) NOT NULL DEFAULT 'pending',
  `verified_purchase` TINYINT(1) NOT NULL DEFAULT 0,
  `ip_hash` CHAR(64) NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at` DATETIME NULL,
  UNIQUE KEY `uq_comments_public_id` (`public_id`),
  KEY `idx_comments_target` (`target_type`,`target_id`,`status`,`created_at`),
  KEY `idx_comments_parent` (`parent_id`),
  CONSTRAINT `chk_comments_rating` CHECK (`rating` IS NULL OR (`rating` BETWEEN 1 AND 5))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `comment_reactions` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `comment_id` BIGINT UNSIGNED NOT NULL,
  `user_id` BIGINT UNSIGNED NULL,
  `visitor_hash` CHAR(64) NULL,
  `reaction` VARCHAR(20) NOT NULL DEFAULT 'like',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY `uq_comment_reaction_user` (`comment_id`,`user_id`,`reaction`),
  KEY `idx_comment_reactions_comment` (`comment_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `comment_reports` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `comment_id` BIGINT UNSIGNED NOT NULL,
  `reporter_email` VARCHAR(255) NULL,
  `reason` VARCHAR(255) NOT NULL,
  `details` TEXT NULL,
  `status` VARCHAR(20) NOT NULL DEFAULT 'open',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY `idx_comment_reports_comment` (`comment_id`,`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO `permissions` (`slug`,`name`,`group_name`) VALUES
('comments.view','View comments','comments'),
('comments.moderate','Moderate comments','comments'),
('comments.manage','Manage comments','comments');
INSERT IGNORE INTO `role_permissions` (`role_id`,`permission_id`)
SELECT r.id,p.id FROM `roles` r JOIN `permissions` p ON p.slug IN ('comments.view','comments.moderate','comments.manage')
WHERE r.slug IN ('admin','super_admin');
INSERT IGNORE INTO `role_permissions` (`role_id`,`permission_id`)
SELECT r.id,p.id FROM `roles` r JOIN `permissions` p ON p.slug='comments.view' WHERE r.slug='editor';
