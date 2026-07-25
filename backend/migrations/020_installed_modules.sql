-- Module Package Manager: installed packages registry, operations, migrations, permissions.

CREATE TABLE IF NOT EXISTS `installed_modules` (
  `id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `slug` VARCHAR(80) NOT NULL,
  `name` VARCHAR(160) NOT NULL,
  `installed_version` VARCHAR(40) NOT NULL DEFAULT '0.0.0',
  `status` VARCHAR(40) NOT NULL DEFAULT 'installed',
  `source` VARCHAR(40) NOT NULL DEFAULT 'package',
  `manifest_json` LONGTEXT NULL,
  `package_checksum` VARCHAR(128) NULL,
  `signature_status` VARCHAR(40) NOT NULL DEFAULT 'unsigned',
  `health_status` VARCHAR(40) NOT NULL DEFAULT 'unknown',
  `last_error` TEXT NULL,
  `data_retention` VARCHAR(40) NOT NULL DEFAULT 'preserve',
  `frontend_manifest_json` LONGTEXT NULL,
  `enabled_at` DATETIME NULL,
  `disabled_at` DATETIME NULL,
  `installed_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY `uq_installed_modules_slug` (`slug`),
  KEY `idx_installed_modules_status` (`status`),
  KEY `idx_installed_modules_source` (`source`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `module_operations` (
  `id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `module_slug` VARCHAR(80) NOT NULL,
  `operation` VARCHAR(40) NOT NULL,
  `from_version` VARCHAR(40) NULL,
  `to_version` VARCHAR(40) NULL,
  `status` VARCHAR(40) NOT NULL DEFAULT 'pending',
  `initiated_by` INT UNSIGNED NULL,
  `backup_path` VARCHAR(500) NULL,
  `package_path` VARCHAR(500) NULL,
  `error` TEXT NULL,
  `log_json` LONGTEXT NULL,
  `db_rollback_available` TINYINT(1) NOT NULL DEFAULT 0,
  `file_rollback_available` TINYINT(1) NOT NULL DEFAULT 0,
  `started_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `finished_at` DATETIME NULL,
  KEY `idx_module_ops_slug` (`module_slug`),
  KEY `idx_module_ops_status` (`status`),
  KEY `idx_module_ops_started` (`started_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `module_migrations` (
  `id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `module_slug` VARCHAR(80) NOT NULL,
  `migration` VARCHAR(190) NOT NULL,
  `checksum` VARCHAR(128) NOT NULL,
  `module_version` VARCHAR(40) NULL,
  `batch` INT UNSIGNED NOT NULL DEFAULT 1,
  `applied_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY `uq_module_migration` (`module_slug`, `migration`),
  KEY `idx_module_mig_slug` (`module_slug`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `module_files` (
  `id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `module_slug` VARCHAR(80) NOT NULL,
  `relative_path` VARCHAR(500) NOT NULL,
  `sha256` VARCHAR(64) NOT NULL,
  `size_bytes` INT UNSIGNED NOT NULL DEFAULT 0,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY `uq_module_file` (`module_slug`, `relative_path`(191)),
  KEY `idx_module_files_slug` (`module_slug`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `module_trusted_keys` (
  `id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `key_id` VARCHAR(80) NOT NULL,
  `public_key` TEXT NOT NULL,
  `label` VARCHAR(160) NULL,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY `uq_module_key_id` (`key_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO `permissions` (`slug`, `name`, `group_name`, `description`) VALUES
('modules.view', 'View modules', 'modules', 'List installed modules and package status'),
('modules.upload', 'Upload module packages', 'modules', 'Upload ZIP packages for inspection'),
('modules.install', 'Install modules', 'modules', 'Install new module packages'),
('modules.update', 'Update modules', 'modules', 'Update installed modules from packages'),
('modules.enable', 'Enable modules', 'modules', 'Enable installed modules'),
('modules.disable', 'Disable modules', 'modules', 'Disable installed modules'),
('modules.uninstall', 'Uninstall modules', 'modules', 'Uninstall modules (keep or remove data)'),
('modules.rollback', 'Rollback modules', 'modules', 'Rollback the last module update'),
('modules.view_files', 'View module files', 'modules', 'Inspect installed module file inventory'),
('modules.view_logs', 'View module operation logs', 'modules', 'Read module install/update logs'),
('modules.manage_trusted_sources', 'Manage trusted module keys', 'modules', 'Manage signature public keys');

-- Super admin gets everything via existing CROSS JOIN patterns; grant explicitly for new installs.
INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r
INNER JOIN permissions p ON p.slug LIKE 'modules.%'
WHERE r.slug = 'super_admin';

INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r
INNER JOIN permissions p ON p.slug IN (
  'modules.view', 'modules.view_files', 'modules.view_logs'
)
WHERE r.slug = 'admin';
