-- Harden role → permission matrix: admin loses system.manage, gains users.manage.
-- Critical ops (plugins, backup, updates, system, mcp, …) stay super_admin / MCP only.

INSERT IGNORE INTO permissions (slug, name, group_name) VALUES
('commerce.manage', 'Manage commerce', 'commerce'),
('integrations.manage', 'Manage integrations', 'integrations');

-- Revoke critical system access from regular admin
DELETE rp FROM role_permissions rp
INNER JOIN roles r ON r.id = rp.role_id
INNER JOIN permissions p ON p.id = rp.permission_id
WHERE r.slug = 'admin' AND p.slug = 'system.manage';

-- Ensure admin has day-to-day permissions (including users.manage for editors)
INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r
INNER JOIN permissions p ON p.slug IN (
  'content.view', 'content.create', 'content.update', 'content.delete', 'content.publish',
  'content.restore', 'content.force_delete',
  'media.manage',
  'settings.manage',
  'users.manage',
  'activity.view',
  'commerce.manage',
  'integrations.manage'
)
WHERE r.slug = 'admin';

-- Super admin keeps / gains every permission
INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p WHERE r.slug = 'super_admin';
