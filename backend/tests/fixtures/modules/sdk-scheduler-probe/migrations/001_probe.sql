CREATE TABLE IF NOT EXISTS `sdk_scheduler_probe_hits` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `slug` VARCHAR(120) NOT NULL,
  `kind` VARCHAR(40) NOT NULL,
  `note` VARCHAR(255) NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_sdk_sched_probe_slug` (`slug`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO `permissions` (`slug`, `name`, `group_name`) VALUES
('sdk-scheduler-probe.view', 'View SDK Scheduler Probe', 'modules');

INSERT IGNORE INTO `role_permissions` (`role_id`, `permission_id`)
SELECT r.id, p.id FROM `roles` r
INNER JOIN `permissions` p ON p.slug = 'sdk-scheduler-probe.view'
WHERE r.slug IN ('admin', 'super_admin');

INSERT IGNORE INTO `modules` (`name`, `is_enabled`, `settings`) VALUES
('sdk-scheduler-probe', 0, NULL);
