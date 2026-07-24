-- Declarative automations
CREATE TABLE IF NOT EXISTS `automations` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(200) NOT NULL,
  `description` TEXT NULL,
  `status` VARCHAR(24) NOT NULL DEFAULT 'draft',
  `trigger_type` VARCHAR(120) NOT NULL,
  `definition` LONGTEXT NOT NULL,
  `version` INT UNSIGNED NOT NULL DEFAULT 1,
  `run_count` BIGINT UNSIGNED NOT NULL DEFAULT 0,
  `last_run_at` DATETIME NULL,
  `created_by` INT UNSIGNED NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_automations_trigger` (`trigger_type`, `status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `automation_runs` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `automation_id` BIGINT UNSIGNED NOT NULL,
  `status` VARCHAR(24) NOT NULL DEFAULT 'running',
  `trigger_event` VARCHAR(120) NULL,
  `context` LONGTEXT NULL,
  `idempotency_key` VARCHAR(190) NULL,
  `current_step` INT UNSIGNED NOT NULL DEFAULT 0,
  `error` TEXT NULL,
  `started_at` DATETIME NOT NULL,
  `finished_at` DATETIME NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_automation_run_idempotency` (`automation_id`, `idempotency_key`),
  KEY `idx_automation_runs` (`automation_id`, `id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `automation_run_steps` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `run_id` BIGINT UNSIGNED NOT NULL,
  `step_index` INT UNSIGNED NOT NULL,
  `action_type` VARCHAR(80) NOT NULL,
  `status` VARCHAR(24) NOT NULL,
  `input` LONGTEXT NULL,
  `output` LONGTEXT NULL,
  `error` TEXT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `finished_at` DATETIME NULL,
  PRIMARY KEY (`id`),
  KEY `idx_automation_run_steps` (`run_id`, `step_index`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO `permissions` (`slug`, `name`, `group_name`) VALUES
('automations.view', 'View automations', 'automations'),
('automations.manage', 'Manage automations', 'automations'),
('automations.run', 'Run automations', 'automations');
INSERT IGNORE INTO `role_permissions` (`role_id`, `permission_id`)
SELECT r.id, p.id FROM `roles` r JOIN `permissions` p ON p.slug IN
('automations.view','automations.manage','automations.run')
WHERE r.slug IN ('admin','super_admin');
INSERT IGNORE INTO `modules` (`name`, `is_enabled`, `settings`) VALUES ('automation', 0, NULL);
