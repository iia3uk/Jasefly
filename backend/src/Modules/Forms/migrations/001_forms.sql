-- Forms engine

CREATE TABLE IF NOT EXISTS `forms` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(200) NOT NULL,
  `slug` VARCHAR(120) NOT NULL,
  `description` TEXT NULL,
  `status` VARCHAR(32) NOT NULL DEFAULT 'draft',
  `success_message` VARCHAR(500) NULL,
  `redirect_url` VARCHAR(1024) NULL,
  `submit_button_text` VARCHAR(120) NULL DEFAULT 'Отправить',
  `settings` JSON NULL,
  `created_by` INT UNSIGNED NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at` DATETIME NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_forms_slug` (`slug`),
  KEY `idx_forms_status` (`status`),
  KEY `idx_forms_deleted` (`deleted_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `form_fields` (
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
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_form_fields_form` (`form_id`, `sort_order`),
  UNIQUE KEY `uq_form_field_name` (`form_id`, `name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `form_versions` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `form_id` BIGINT UNSIGNED NOT NULL,
  `version` INT UNSIGNED NOT NULL,
  `snapshot` LONGTEXT NOT NULL,
  `created_by` INT UNSIGNED NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_form_version` (`form_id`, `version`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `form_actions` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `form_id` BIGINT UNSIGNED NOT NULL,
  `type` VARCHAR(64) NOT NULL,
  `config` JSON NULL,
  `sort_order` INT NOT NULL DEFAULT 0,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`),
  KEY `idx_form_actions_form` (`form_id`, `sort_order`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `form_submissions` (
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
  UNIQUE KEY `uq_form_sub_public` (`public_id`),
  KEY `idx_form_sub_form` (`form_id`, `status`, `created_at`),
  KEY `idx_form_sub_deleted` (`deleted_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `form_submission_values` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `submission_id` BIGINT UNSIGNED NOT NULL,
  `field_name` VARCHAR(120) NOT NULL,
  `field_label` VARCHAR(255) NULL,
  `value_text` LONGTEXT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_fsv_sub` (`submission_id`),
  KEY `idx_fsv_field` (`field_name`(64))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO `permissions` (`slug`, `name`, `group_name`) VALUES
('forms.view', 'View forms', 'forms'),
('forms.manage', 'Manage forms', 'forms'),
('forms.submissions.view', 'View form submissions', 'forms'),
('forms.submissions.manage', 'Manage form submissions', 'forms'),
('forms.export', 'Export form submissions', 'forms');

INSERT IGNORE INTO `role_permissions` (`role_id`, `permission_id`)
SELECT r.id, p.id FROM `roles` r
INNER JOIN `permissions` p ON p.slug IN (
  'forms.view','forms.manage','forms.submissions.view','forms.submissions.manage','forms.export'
)
WHERE r.slug IN ('admin', 'super_admin');

INSERT IGNORE INTO `role_permissions` (`role_id`, `permission_id`)
SELECT r.id, p.id FROM `roles` r
INNER JOIN `permissions` p ON p.slug IN ('forms.view', 'forms.submissions.view')
WHERE r.slug = 'editor';

INSERT IGNORE INTO `modules` (`name`, `is_enabled`, `settings`) VALUES
('forms', 1, NULL);

-- Default contact form (adapter for legacy contact-form widget)
INSERT INTO `forms` (`name`, `slug`, `description`, `status`, `success_message`, `submit_button_text`, `settings`)
SELECT 'Контакты', 'contact', 'Системная форма обратной связи', 'active',
       'Спасибо! Сообщение отправлено.', 'Отправить',
       JSON_OBJECT('honeypot', true, 'timing_min_ms', 800, 'system', true)
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM `forms` WHERE `slug` = 'contact');

INSERT INTO `form_fields` (`form_id`, `name`, `label`, `type`, `required`, `sort_order`, `validation`)
SELECT f.id, 'name', 'Имя', 'text', 1, 10, JSON_OBJECT('max_length', 200)
FROM `forms` f WHERE f.slug = 'contact'
AND NOT EXISTS (SELECT 1 FROM form_fields ff WHERE ff.form_id = f.id AND ff.name = 'name');

INSERT INTO `form_fields` (`form_id`, `name`, `label`, `type`, `required`, `sort_order`, `validation`)
SELECT f.id, 'email', 'Email', 'email', 1, 20, JSON_OBJECT('email', true)
FROM `forms` f WHERE f.slug = 'contact'
AND NOT EXISTS (SELECT 1 FROM form_fields ff WHERE ff.form_id = f.id AND ff.name = 'email');

INSERT INTO `form_fields` (`form_id`, `name`, `label`, `type`, `required`, `sort_order`, `validation`)
SELECT f.id, 'message', 'Сообщение', 'textarea', 1, 30, JSON_OBJECT('min_length', 2, 'max_length', 5000)
FROM `forms` f WHERE f.slug = 'contact'
AND NOT EXISTS (SELECT 1 FROM form_fields ff WHERE ff.form_id = f.id AND ff.name = 'message');

INSERT INTO `form_actions` (`form_id`, `type`, `config`, `sort_order`, `is_active`)
SELECT f.id, 'save_submission', JSON_OBJECT(), 10, 1
FROM `forms` f WHERE f.slug = 'contact'
AND NOT EXISTS (SELECT 1 FROM form_actions fa WHERE fa.form_id = f.id AND fa.type = 'save_submission');

INSERT INTO `form_actions` (`form_id`, `type`, `config`, `sort_order`, `is_active`)
SELECT f.id, 'send_telegram', JSON_OBJECT(), 20, 1
FROM `forms` f WHERE f.slug = 'contact'
AND NOT EXISTS (SELECT 1 FROM form_actions fa WHERE fa.form_id = f.id AND fa.type = 'send_telegram');

INSERT INTO `form_actions` (`form_id`, `type`, `config`, `sort_order`, `is_active`)
SELECT f.id, 'send_email', JSON_OBJECT(), 30, 1
FROM `forms` f WHERE f.slug = 'contact'
AND NOT EXISTS (SELECT 1 FROM form_actions fa WHERE fa.form_id = f.id AND fa.type = 'send_email');
