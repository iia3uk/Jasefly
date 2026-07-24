-- Jasefly Lab — isolated visual/functional experiments

CREATE TABLE IF NOT EXISTS `lab_experiments` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(191) NOT NULL,
  `slug` VARCHAR(191) NOT NULL,
  `entry_key` VARCHAR(64) NOT NULL,
  `status` VARCHAR(32) NOT NULL DEFAULT 'draft',
  `is_public` TINYINT(1) NOT NULL DEFAULT 0,
  `noindex` TINYINT(1) NOT NULL DEFAULT 1,
  `render_mode` VARCHAR(32) NOT NULL DEFAULT 'embedded',
  `settings_json` JSON NULL,
  `content_json` JSON NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at` DATETIME NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_lab_experiments_slug` (`slug`),
  KEY `idx_lab_experiments_status` (`status`),
  KEY `idx_lab_experiments_entry` (`entry_key`),
  KEY `idx_lab_experiments_deleted` (`deleted_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO `permissions` (`slug`, `name`, `group_name`) VALUES
('lab.view', 'View lab experiments', 'lab'),
('lab.create', 'Create lab experiments', 'lab'),
('lab.update', 'Update lab experiments', 'lab'),
('lab.delete', 'Delete lab experiments', 'lab'),
('lab.publish', 'Publish / activate lab experiments', 'lab'),
('lab.preview', 'Preview lab experiments', 'lab');

INSERT IGNORE INTO `role_permissions` (`role_id`, `permission_id`)
SELECT r.id, p.id FROM `roles` r
INNER JOIN `permissions` p ON p.slug IN (
  'lab.view', 'lab.create', 'lab.update', 'lab.delete', 'lab.publish', 'lab.preview'
)
WHERE r.slug IN ('admin', 'super_admin');

INSERT IGNORE INTO `role_permissions` (`role_id`, `permission_id`)
SELECT r.id, p.id FROM `roles` r
INNER JOIN `permissions` p ON p.slug IN ('lab.view', 'lab.preview')
WHERE r.slug = 'editor';
