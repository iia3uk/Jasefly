-- Platform SDK: capabilities registry + provider selection
CREATE TABLE IF NOT EXISTS `platform_capabilities` (
  `id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `capability` VARCHAR(120) NOT NULL,
  `provider` VARCHAR(160) NOT NULL,
  `module_slug` VARCHAR(64) NULL,
  `priority` INT NOT NULL DEFAULT 100,
  `meta_json` JSON NULL,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NULL ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY `uq_platform_cap_provider` (`capability`, `provider`),
  KEY `idx_platform_cap` (`capability`, `is_active`, `priority`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `platform_capability_overrides` (
  `capability` VARCHAR(120) NOT NULL PRIMARY KEY,
  `provider` VARCHAR(160) NOT NULL,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO `platform_capabilities` (`capability`, `provider`, `module_slug`, `priority`, `meta_json`) VALUES
('mail.send', 'core.mail', NULL, 100, NULL),
('scheduler.jobs', 'core.scheduler', NULL, 100, NULL),
('storage.files', 'core.storage', NULL, 100, NULL),
('builder.widgets', 'core.builder', NULL, 100, NULL),
('builder.inspector', 'core.builder', NULL, 100, NULL),
('notifications.send', 'core.notifications', NULL, 100, NULL),
('media.library', 'core.media', NULL, 100, NULL),
('users.roles', 'core.users', NULL, 100, NULL),
('events.publish', 'core.events', NULL, 100, NULL),
('events.subscribe', 'core.events', NULL, 100, NULL),
('http.client', 'core.http', NULL, 100, NULL),
('settings.global', 'core.settings', NULL, 100, NULL),
('analytics.events', 'core.analytics', NULL, 50, NULL),
('permissions.check', 'core.permissions', NULL, 100, NULL),
('content.pages', 'core.content', NULL, 100, NULL);
