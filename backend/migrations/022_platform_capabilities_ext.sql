-- Extended core capabilities for Platform SDK certification
INSERT IGNORE INTO `platform_capabilities` (`capability`, `provider`, `module_slug`, `priority`, `meta_json`) VALUES
('admin.pages', 'core.admin', NULL, 100, NULL),
('public.routes', 'core.public', NULL, 100, NULL),
('api.routes', 'core.http', NULL, 100, NULL),
('settings.module', 'core.settings', NULL, 100, NULL),
('users.current', 'core.users', NULL, 100, NULL);
