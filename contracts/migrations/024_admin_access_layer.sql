-- Admin Access Layer: multi-role, capability overrides, audit, WP-like roles.
-- Idempotent where possible. Run after 023.

SET NAMES utf8mb4;

-- Roles: super flag + role_rank (avoid MySQL reserved word `rank`)
ALTER TABLE roles ADD COLUMN is_super TINYINT(1) NOT NULL DEFAULT 0 AFTER is_system;
ALTER TABLE roles ADD COLUMN role_rank INT NOT NULL DEFAULT 100 AFTER is_super;

UPDATE roles SET is_super = 1, role_rank = 0 WHERE slug = 'super_admin';
UPDATE roles SET role_rank = 10 WHERE slug = 'admin';
UPDATE roles SET role_rank = 20 WHERE slug = 'editor';

INSERT IGNORE INTO roles (slug, name, description, is_system, is_super, role_rank) VALUES
('author', 'Author', 'Create, publish and manage own content.', 1, 0, 30),
('contributor', 'Contributor', 'Create and edit own content without publishing.', 1, 0, 40),
('subscriber', 'Subscriber', 'Profile and allowed member areas.', 1, 0, 50),
('member', 'Member', 'Legacy member (same caps as subscriber).', 1, 0, 50);

-- Permissions metadata
ALTER TABLE permissions ADD COLUMN risk_level VARCHAR(16) NOT NULL DEFAULT 'low' AFTER description;
ALTER TABLE permissions ADD COLUMN scope_default VARCHAR(16) NOT NULL DEFAULT 'site' AFTER risk_level;
ALTER TABLE permissions ADD COLUMN is_active TINYINT(1) NOT NULL DEFAULT 1 AFTER scope_default;

-- Multi-role
CREATE TABLE IF NOT EXISTS user_roles (
  user_id INT UNSIGNED NOT NULL,
  role_id INT UNSIGNED NOT NULL,
  is_primary TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, role_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE,
  INDEX idx_user_roles_role (role_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Per-user allow/deny overrides (deny wins)
CREATE TABLE IF NOT EXISTS user_capability_overrides (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNSIGNED NOT NULL,
  capability_slug VARCHAR(80) NOT NULL,
  effect ENUM('allow', 'deny') NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_user_cap_override (user_id, capability_slug),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_uco_slug (capability_slug)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Alias map: legacy permission slug → canonical capability (or expansion handled in PHP)
CREATE TABLE IF NOT EXISTS permission_aliases (
  alias_slug VARCHAR(80) NOT NULL PRIMARY KEY,
  target_slug VARCHAR(80) NOT NULL,
  INDEX idx_perm_alias_target (target_slug)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Access / RBAC audit
CREATE TABLE IF NOT EXISTS access_audit_log (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  actor_user_id INT UNSIGNED NULL,
  action VARCHAR(80) NOT NULL,
  target_type VARCHAR(60) NULL,
  target_id VARCHAR(64) NULL,
  before_json JSON NULL,
  after_json JSON NULL,
  ip_address VARCHAR(45) NULL,
  request_id VARCHAR(64) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_access_audit_actor (actor_user_id),
  INDEX idx_access_audit_created (created_at),
  INDEX idx_access_audit_action (action)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Core ACL capabilities (new + keep legacy)
INSERT IGNORE INTO permissions (slug, name, group_name, description, risk_level, scope_default) VALUES
('dashboard.view', 'View admin dashboard', 'dashboard', 'Access admin shell and dashboard', 'low', 'site'),
('content.edit_own', 'Edit own content', 'content', 'Edit content owned by the user', 'low', 'own'),
('content.edit_any', 'Edit any content', 'content', 'Edit any content of the type', 'medium', 'any'),
('content.delete_own', 'Delete own content', 'content', 'Trash own content', 'medium', 'own'),
('content.delete_any', 'Delete any content', 'content', 'Trash any content', 'high', 'any'),
('content.publish_own', 'Publish own content', 'content', 'Publish own drafts', 'medium', 'own'),
('builder.use', 'Use page builder', 'builder', 'Open and edit layouts', 'medium', 'site'),
('builder.publish', 'Publish from builder', 'builder', 'Publish page layouts', 'high', 'site'),
('pages.manage', 'Manage pages', 'pages', 'CMS pages CRUD', 'medium', 'site'),
('navigation.manage', 'Manage navigation', 'navigation', 'Menus and nav items', 'medium', 'site'),
('users.view', 'View users', 'users', 'List users', 'medium', 'site'),
('users.create', 'Create users', 'users', 'Create user accounts', 'high', 'site'),
('users.edit', 'Edit users', 'users', 'Edit user accounts', 'high', 'site'),
('users.delete', 'Delete users', 'users', 'Delete user accounts', 'critical', 'site'),
('roles.manage', 'Manage roles', 'roles', 'Create/edit roles and grants', 'critical', 'platform'),
('access.manage', 'Manage access', 'access', 'Overrides, effective rights, ACL UI', 'critical', 'platform'),
('orders.view', 'View orders', 'orders', 'View commerce orders', 'medium', 'site'),
('orders.manage', 'Manage orders', 'orders', 'Manage commerce orders', 'high', 'site'),
('modules.view', 'View modules', 'modules', 'Module Package Manager list', 'medium', 'platform'),
('modules.install', 'Install modules', 'modules', 'Install ZIP modules', 'critical', 'platform'),
('modules.enable', 'Enable modules', 'modules', 'Enable/disable modules', 'high', 'platform'),
('modules.update', 'Update modules', 'modules', 'Update ZIP modules', 'critical', 'platform'),
('modules.delete', 'Delete modules', 'modules', 'Uninstall modules', 'critical', 'platform'),
('plugins.manage', 'Manage plugins', 'plugins', 'Toggle core plugins', 'high', 'platform'),
('settings.view', 'View settings', 'settings', 'Read site settings', 'low', 'site'),
('seo.manage', 'Manage SEO', 'seo', 'SEO settings', 'medium', 'site'),
('system.diagnostics', 'System diagnostics', 'system', 'Health and diagnostics', 'high', 'platform'),
('system.logs', 'System logs', 'system', 'View system/activity logs', 'medium', 'platform'),
('system.updates', 'System updates', 'system', 'Apply CMS updates', 'critical', 'platform'),
('system.security', 'System security', 'system', 'Security settings', 'critical', 'platform'),
('mcp.manage', 'Manage MCP', 'mcp', 'MCP tokens and tools', 'critical', 'platform'),
('deploy.execute', 'Execute deploy', 'deploy', 'Hosting deploy actions', 'critical', 'platform');

-- Aliases: legacy → canonical
INSERT IGNORE INTO permission_aliases (alias_slug, target_slug) VALUES
('content.update', 'content.edit_any'),
('content.delete', 'content.delete_any'),
('content.edit_any', 'content.update'),
('content.delete_any', 'content.delete');

-- Backfill user_roles from users.role
-- COLLATE: users.role may be utf8mb4_unicode_ci while roles.slug is server-default 0900_ai_ci (MySQL 8).
INSERT IGNORE INTO user_roles (user_id, role_id, is_primary)
SELECT u.id, r.id, 1
FROM users u
INNER JOIN roles r ON r.slug COLLATE utf8mb4_unicode_ci = u.role COLLATE utf8mb4_unicode_ci;

-- Author grants
INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r
INNER JOIN permissions p ON p.slug IN (
  'dashboard.view',
  'content.view', 'content.create', 'content.edit_own', 'content.delete_own', 'content.publish_own', 'content.publish',
  'media.manage', 'builder.use', 'builder.publish', 'pages.manage'
)
WHERE r.slug = 'author';

-- Contributor grants
INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r
INNER JOIN permissions p ON p.slug IN (
  'dashboard.view',
  'content.view', 'content.create', 'content.edit_own',
  'media.manage', 'builder.use'
)
WHERE r.slug = 'contributor';

-- Subscriber / member
INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r
INNER JOIN permissions p ON p.slug IN ('dashboard.view')
WHERE r.slug IN ('subscriber', 'member');

-- Expand editor / admin with new caps (keep existing)
INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r
INNER JOIN permissions p ON p.slug IN (
  'dashboard.view', 'content.edit_any', 'content.delete_any', 'builder.use', 'builder.publish',
  'pages.manage', 'navigation.manage', 'comments.moderate', 'settings.view', 'seo.manage'
)
WHERE r.slug = 'editor';

INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r
INNER JOIN permissions p ON p.slug IN (
  'dashboard.view', 'content.edit_any', 'content.delete_any', 'builder.use', 'builder.publish',
  'pages.manage', 'navigation.manage', 'users.view', 'users.create', 'users.edit',
  'roles.manage', 'access.manage', 'orders.view', 'orders.manage', 'plugins.manage',
  'settings.view', 'seo.manage', 'modules.view', 'modules.enable'
)
WHERE r.slug = 'admin';

-- Super admin: every permission
INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p WHERE r.slug = 'super_admin';
