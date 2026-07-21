-- Enterprise CMS features: soft delete, RBAC, activity log, slug redirects, media enhancements
-- Run after 001_schema.sql (installer runs migrations in order)

SET NAMES utf8mb4;

-- ─── Soft delete columns ─────────────────────────────────────────────────────

ALTER TABLE projects ADD COLUMN deleted_at DATETIME NULL AFTER updated_at, ADD INDEX idx_projects_deleted (deleted_at);
ALTER TABLE blog_posts ADD COLUMN deleted_at DATETIME NULL AFTER updated_at, ADD INDEX idx_blog_deleted (deleted_at);
ALTER TABLE media ADD COLUMN deleted_at DATETIME NULL AFTER updated_at, ADD INDEX idx_media_deleted (deleted_at);
ALTER TABLE project_categories ADD COLUMN deleted_at DATETIME NULL AFTER created_at, ADD INDEX idx_proj_cat_deleted (deleted_at);
ALTER TABLE blog_categories ADD COLUMN deleted_at DATETIME NULL AFTER created_at, ADD INDEX idx_blog_cat_deleted (deleted_at);
ALTER TABLE skill_categories ADD COLUMN deleted_at DATETIME NULL AFTER updated_at, ADD INDEX idx_skill_cat_deleted (deleted_at);
ALTER TABLE skills ADD COLUMN deleted_at DATETIME NULL AFTER updated_at, ADD INDEX idx_skills_deleted (deleted_at);
ALTER TABLE experience ADD COLUMN deleted_at DATETIME NULL AFTER updated_at, ADD INDEX idx_experience_deleted (deleted_at);
ALTER TABLE services ADD COLUMN deleted_at DATETIME NULL AFTER updated_at, ADD INDEX idx_services_deleted (deleted_at);
ALTER TABLE testimonials ADD COLUMN deleted_at DATETIME NULL AFTER updated_at, ADD INDEX idx_testimonials_deleted (deleted_at);

-- Media metadata
ALTER TABLE media ADD COLUMN caption VARCHAR(500) NULL AFTER alt_text;
ALTER TABLE media ADD COLUMN uploaded_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP AFTER caption;
ALTER TABLE media ADD COLUMN replaced_at DATETIME NULL AFTER uploaded_at;

-- ─── Slug redirects (301) ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS slug_redirects (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  entity_type VARCHAR(60) NOT NULL,
  old_slug VARCHAR(255) NOT NULL,
  new_slug VARCHAR(255) NOT NULL,
  entity_id INT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_slug_redirect (entity_type, old_slug),
  INDEX idx_slug_redirect_new (entity_type, new_slug),
  INDEX idx_slug_redirect_entity (entity_type, entity_id)
) ENGINE=InnoDB;

-- ─── Activity log ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS activity_logs (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNSIGNED NULL,
  user_name VARCHAR(120) NULL,
  action VARCHAR(60) NOT NULL,
  entity_type VARCHAR(60) NULL,
  entity_id INT UNSIGNED NULL,
  entity_label VARCHAR(255) NULL,
  metadata JSON NULL,
  ip_address VARCHAR(45) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_activity_user (user_id),
  INDEX idx_activity_created (created_at),
  INDEX idx_activity_action (action),
  INDEX idx_activity_entity (entity_type, entity_id)
) ENGINE=InnoDB;

-- ─── RBAC ────────────────────────────────────────────────────────────────────

ALTER TABLE users MODIFY COLUMN role VARCHAR(60) NOT NULL DEFAULT 'admin';

CREATE TABLE IF NOT EXISTS roles (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  slug VARCHAR(60) NOT NULL UNIQUE,
  name VARCHAR(120) NOT NULL,
  description TEXT NULL,
  is_system TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS permissions (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  slug VARCHAR(80) NOT NULL UNIQUE,
  name VARCHAR(120) NOT NULL,
  group_name VARCHAR(60) NULL,
  description VARCHAR(255) NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS role_permissions (
  role_id INT UNSIGNED NOT NULL,
  permission_id INT UNSIGNED NOT NULL,
  PRIMARY KEY (role_id, permission_id),
  FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE,
  FOREIGN KEY (permission_id) REFERENCES permissions(id) ON DELETE CASCADE
) ENGINE=InnoDB;

INSERT IGNORE INTO roles (slug, name, description, is_system) VALUES
('super_admin', 'Super Admin', 'Full system access including user and permission management.', 1),
('admin', 'Admin', 'Manage all content and most settings.', 1),
('editor', 'Editor', 'Create and edit content. Cannot modify system settings.', 1);

INSERT IGNORE INTO permissions (slug, name, group_name) VALUES
('content.view', 'View content', 'content'),
('content.create', 'Create content', 'content'),
('content.update', 'Update content', 'content'),
('content.delete', 'Move content to trash', 'content'),
('content.publish', 'Publish content', 'content'),
('content.restore', 'Restore from trash', 'content'),
('content.force_delete', 'Permanently delete', 'content'),
('media.manage', 'Manage media library', 'media'),
('settings.manage', 'Manage site settings', 'settings'),
('system.manage', 'System status and backups', 'system'),
('users.manage', 'Manage users and roles', 'users'),
('activity.view', 'View activity log', 'system');

-- Super Admin: all permissions
INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p WHERE r.slug = 'super_admin';

-- Admin: content + settings + users (editors), not system.manage
INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
WHERE r.slug = 'admin' AND p.slug NOT IN ('system.manage');

-- Editor: content + media only
INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r
INNER JOIN permissions p ON p.slug IN (
  'content.view', 'content.create', 'content.update', 'content.delete', 'content.publish', 'media.manage'
)
WHERE r.slug = 'editor';

-- App metadata
CREATE TABLE IF NOT EXISTS app_meta (
  meta_key VARCHAR(80) PRIMARY KEY,
  meta_value VARCHAR(255) NOT NULL
) ENGINE=InnoDB;

INSERT IGNORE INTO app_meta (meta_key, meta_value) VALUES ('app_version', '1.0.0');
