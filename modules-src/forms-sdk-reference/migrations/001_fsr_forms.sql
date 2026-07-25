-- Forms SDK Reference engine (prefix fsr_)

CREATE TABLE IF NOT EXISTS `fsr_forms` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(200) NOT NULL,
  `slug` VARCHAR(120) NOT NULL,
  `description` TEXT NULL,
  `status` VARCHAR(32) NOT NULL DEFAULT 'draft',
  `success_message` VARCHAR(500) NULL,
  `redirect_url` VARCHAR(1024) NULL,
  `submit_button_text` VARCHAR(120) NULL DEFAULT 'Отправить',
  `settings` JSON NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at` DATETIME NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_fsr_forms_slug` (`slug`),
  KEY `idx_fsr_forms_status` (`status`),
  KEY `idx_fsr_forms_deleted` (`deleted_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `fsr_form_fields` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `form_id` BIGINT UNSIGNED NOT NULL,
  `name` VARCHAR(120) NOT NULL,
  `label` VARCHAR(255) NOT NULL DEFAULT '',
  `type` VARCHAR(40) NOT NULL DEFAULT 'text',
  `placeholder` VARCHAR(255) NULL,
  `help_text` VARCHAR(500) NULL,
  `default_value` TEXT NULL,
  `required` TINYINT(1) NOT NULL DEFAULT 0,
  `validation` JSON NULL,
  `options` JSON NULL,
  `width` VARCHAR(20) NOT NULL DEFAULT 'full',
  `sort_order` INT NOT NULL DEFAULT 0,
  `visibility` JSON NULL,
  PRIMARY KEY (`id`),
  KEY `idx_fsr_form_fields_form` (`form_id`, `sort_order`),
  UNIQUE KEY `uq_fsr_form_field_name` (`form_id`, `name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `fsr_form_submissions` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `public_id` CHAR(26) NOT NULL,
  `form_id` BIGINT UNSIGNED NOT NULL,
  `status` VARCHAR(32) NOT NULL DEFAULT 'new',
  `page_url` VARCHAR(1024) NULL,
  `utm` JSON NULL,
  `ip_hash` CHAR(64) NULL,
  `ua_hash` CHAR(64) NULL,
  `internal_note` TEXT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at` DATETIME NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_fsr_form_sub_public` (`public_id`),
  KEY `idx_fsr_form_sub_form` (`form_id`, `status`, `created_at`),
  KEY `idx_fsr_form_sub_deleted` (`deleted_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `fsr_form_submission_values` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `submission_id` BIGINT UNSIGNED NOT NULL,
  `field_name` VARCHAR(120) NOT NULL,
  `field_label` VARCHAR(255) NULL,
  `value_text` LONGTEXT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_fsr_fsv_sub` (`submission_id`),
  KEY `idx_fsr_fsv_field` (`field_name`(64))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO `permissions` (`slug`, `name`, `group_name`) VALUES
('forms-ref.view', 'View SDK reference forms', 'forms-ref'),
('forms-ref.manage', 'Manage SDK reference forms', 'forms-ref'),
('forms-ref.submissions.view', 'View SDK reference submissions', 'forms-ref'),
('forms-ref.submissions.manage', 'Manage SDK reference submissions', 'forms-ref'),
('forms-ref.export', 'Export SDK reference submissions', 'forms-ref');

INSERT IGNORE INTO `role_permissions` (`role_id`, `permission_id`)
SELECT r.id, p.id FROM `roles` r
INNER JOIN `permissions` p ON p.slug IN (
  'forms-ref.view', 'forms-ref.manage', 'forms-ref.submissions.view',
  'forms-ref.submissions.manage', 'forms-ref.export'
)
WHERE r.slug IN ('admin', 'super_admin');

INSERT IGNORE INTO `role_permissions` (`role_id`, `permission_id`)
SELECT r.id, p.id FROM `roles` r
INNER JOIN `permissions` p ON p.slug IN ('forms-ref.view', 'forms-ref.submissions.view')
WHERE r.slug = 'editor';

INSERT INTO `fsr_forms` (`name`, `slug`, `description`, `status`, `success_message`, `submit_button_text`, `settings`)
SELECT 'SDK Demo Form', 'sdk-demo', 'Certification demo form', 'active',
       'Спасибо! Заявка принята.', 'Отправить',
       JSON_OBJECT('honeypot', true, 'timing_min_ms', 800)
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM `fsr_forms` WHERE `slug` = 'sdk-demo');

INSERT INTO `fsr_form_fields` (`form_id`, `name`, `label`, `type`, `required`, `sort_order`, `validation`)
SELECT f.id, 'name', 'Имя', 'text', 1, 10, JSON_OBJECT('max_length', 200)
FROM `fsr_forms` f WHERE f.slug = 'sdk-demo'
AND NOT EXISTS (SELECT 1 FROM fsr_form_fields ff WHERE ff.form_id = f.id AND ff.name = 'name');

INSERT INTO `fsr_form_fields` (`form_id`, `name`, `label`, `type`, `required`, `sort_order`, `validation`)
SELECT f.id, 'email', 'Email', 'email', 1, 20, JSON_OBJECT('email', true)
FROM `fsr_forms` f WHERE f.slug = 'sdk-demo'
AND NOT EXISTS (SELECT 1 FROM fsr_form_fields ff WHERE ff.form_id = f.id AND ff.name = 'email');

INSERT INTO `fsr_form_fields` (`form_id`, `name`, `label`, `type`, `required`, `sort_order`, `validation`)
SELECT f.id, 'message', 'Сообщение', 'textarea', 1, 30, JSON_OBJECT('min_length', 2, 'max_length', 5000)
FROM `fsr_forms` f WHERE f.slug = 'sdk-demo'
AND NOT EXISTS (SELECT 1 FROM fsr_form_fields ff WHERE ff.form_id = f.id AND ff.name = 'message');
