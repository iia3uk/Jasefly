-- Jasefly CMS Schema
-- MySQL 8.0+ / MariaDB 10.5+
-- Normalized with foreign keys

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

CREATE DATABASE IF NOT EXISTS portfolio_cms
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE portfolio_cms;

-- ─── Auth ───────────────────────────────────────────────────────────────────

CREATE TABLE users (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  name VARCHAR(120) NOT NULL,
  role ENUM('admin','editor') NOT NULL DEFAULT 'admin',
  avatar_media_id INT UNSIGNED NULL,
  last_login_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE refresh_tokens (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNSIGNED NOT NULL,
  token_hash VARCHAR(64) NOT NULL UNIQUE,
  expires_at DATETIME NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_refresh_user (user_id),
  INDEX idx_refresh_expires (expires_at)
) ENGINE=InnoDB;

CREATE TABLE rate_limits (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  ip_address VARCHAR(45) NOT NULL,
  endpoint VARCHAR(120) NOT NULL,
  attempts INT UNSIGNED NOT NULL DEFAULT 1,
  window_start DATETIME NOT NULL,
  INDEX idx_rate_lookup (ip_address, endpoint, window_start)
) ENGINE=InnoDB;

CREATE TABLE csrf_tokens (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  token VARCHAR(64) NOT NULL UNIQUE,
  user_id INT UNSIGNED NULL,
  expires_at DATETIME NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ─── Media ──────────────────────────────────────────────────────────────────

CREATE TABLE media_folders (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  parent_id INT UNSIGNED NULL,
  slug VARCHAR(140) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (parent_id) REFERENCES media_folders(id) ON DELETE SET NULL,
  UNIQUE KEY uq_folder_parent_slug (parent_id, slug)
) ENGINE=InnoDB;

CREATE TABLE media (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  folder_id INT UNSIGNED NULL,
  filename VARCHAR(255) NOT NULL,
  original_name VARCHAR(255) NOT NULL,
  mime_type VARCHAR(100) NOT NULL,
  extension VARCHAR(20) NOT NULL,
  size_bytes INT UNSIGNED NOT NULL DEFAULT 0,
  width INT UNSIGNED NULL,
  height INT UNSIGNED NULL,
  alt_text VARCHAR(255) NULL,
  path VARCHAR(500) NOT NULL,
  thumbnail_path VARCHAR(500) NULL,
  webp_path VARCHAR(500) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (folder_id) REFERENCES media_folders(id) ON DELETE SET NULL,
  INDEX idx_media_mime (mime_type),
  INDEX idx_media_name (original_name),
  FULLTEXT INDEX ft_media_search (original_name, alt_text, filename)
) ENGINE=InnoDB;

ALTER TABLE users
  ADD CONSTRAINT fk_users_avatar
  FOREIGN KEY (avatar_media_id) REFERENCES media(id) ON DELETE SET NULL;

-- ─── Profile & social ───────────────────────────────────────────────────────

CREATE TABLE profile (
  id TINYINT UNSIGNED PRIMARY KEY DEFAULT 1,
  name VARCHAR(120) NOT NULL DEFAULT '',
  job_title VARCHAR(200) NOT NULL DEFAULT '',
  short_bio TEXT NULL,
  bio LONGTEXT NULL,
  photo_media_id INT UNSIGNED NULL,
  avatar_media_id INT UNSIGNED NULL,
  resume_media_id INT UNSIGNED NULL,
  location VARCHAR(200) NULL,
  availability_status VARCHAR(120) NULL,
  years_experience INT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (photo_media_id) REFERENCES media(id) ON DELETE SET NULL,
  FOREIGN KEY (avatar_media_id) REFERENCES media(id) ON DELETE SET NULL,
  FOREIGN KEY (resume_media_id) REFERENCES media(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE social_links (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  platform VARCHAR(60) NOT NULL,
  label VARCHAR(120) NOT NULL,
  url VARCHAR(500) NOT NULL,
  icon VARCHAR(60) NULL,
  sort_order INT NOT NULL DEFAULT 0,
  is_visible TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_social_sort (sort_order)
) ENGINE=InnoDB;

CREATE TABLE statistics (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  label VARCHAR(120) NOT NULL,
  value VARCHAR(60) NOT NULL,
  suffix VARCHAR(20) NULL,
  icon VARCHAR(60) NULL,
  sort_order INT NOT NULL DEFAULT 0,
  is_visible TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- ─── Experience & education ─────────────────────────────────────────────────

CREATE TABLE experience (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  company VARCHAR(200) NOT NULL,
  role VARCHAR(200) NOT NULL,
  location VARCHAR(200) NULL,
  description LONGTEXT NULL,
  start_date DATE NOT NULL,
  end_date DATE NULL,
  is_current TINYINT(1) NOT NULL DEFAULT 0,
  company_logo_id INT UNSIGNED NULL,
  technologies JSON NULL,
  sort_order INT NOT NULL DEFAULT 0,
  is_visible TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (company_logo_id) REFERENCES media(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE education (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  institution VARCHAR(200) NOT NULL,
  degree VARCHAR(200) NOT NULL,
  field_of_study VARCHAR(200) NULL,
  description TEXT NULL,
  start_date DATE NULL,
  end_date DATE NULL,
  is_current TINYINT(1) NOT NULL DEFAULT 0,
  logo_media_id INT UNSIGNED NULL,
  sort_order INT NOT NULL DEFAULT 0,
  is_visible TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (logo_media_id) REFERENCES media(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- ─── Skills ─────────────────────────────────────────────────────────────────

CREATE TABLE skill_categories (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  slug VARCHAR(140) NOT NULL UNIQUE,
  description TEXT NULL,
  icon VARCHAR(60) NULL,
  sort_order INT NOT NULL DEFAULT 0,
  is_visible TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE skills (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  category_id INT UNSIGNED NOT NULL,
  name VARCHAR(120) NOT NULL,
  percentage TINYINT UNSIGNED NOT NULL DEFAULT 0,
  icon VARCHAR(60) NULL,
  color VARCHAR(20) NULL,
  sort_order INT NOT NULL DEFAULT 0,
  is_visible TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (category_id) REFERENCES skill_categories(id) ON DELETE CASCADE,
  INDEX idx_skills_category (category_id)
) ENGINE=InnoDB;

-- ─── Projects ───────────────────────────────────────────────────────────────

CREATE TABLE project_categories (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  slug VARCHAR(140) NOT NULL UNIQUE,
  description TEXT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE projects (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  slug VARCHAR(255) NOT NULL UNIQUE,
  short_description TEXT NULL,
  description LONGTEXT NULL,
  content LONGTEXT NULL,
  cover_media_id INT UNSIGNED NULL,
  category_id INT UNSIGNED NULL,
  status ENUM('draft','published','archived') NOT NULL DEFAULT 'draft',
  project_status ENUM('completed','in_progress','on_hold','concept','cancelled') NOT NULL DEFAULT 'completed',
  is_featured TINYINT(1) NOT NULL DEFAULT 0,
  sort_order INT NOT NULL DEFAULT 0,
  role VARCHAR(200) NULL,
  team_size INT UNSIGNED NULL,
  completion_date DATE NULL,
  github_url VARCHAR(500) NULL,
  website_url VARCHAR(500) NULL,
  steam_url VARCHAR(500) NULL,
  itch_url VARCHAR(500) NULL,
  google_play_url VARCHAR(500) NULL,
  app_store_url VARCHAR(500) NULL,
  download_url VARCHAR(500) NULL,
  download_label VARCHAR(120) NULL,
  video_url VARCHAR(500) NULL,
  youtube_url VARCHAR(500) NULL,
  challenges LONGTEXT NULL,
  seo_title VARCHAR(255) NULL,
  seo_description TEXT NULL,
  seo_keywords VARCHAR(500) NULL,
  og_image_id INT UNSIGNED NULL,
  published_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (cover_media_id) REFERENCES media(id) ON DELETE SET NULL,
  FOREIGN KEY (category_id) REFERENCES project_categories(id) ON DELETE SET NULL,
  FOREIGN KEY (og_image_id) REFERENCES media(id) ON DELETE SET NULL,
  INDEX idx_projects_status (status),
  INDEX idx_projects_featured (is_featured),
  INDEX idx_projects_sort (sort_order),
  FULLTEXT INDEX ft_projects (title, short_description)
) ENGINE=InnoDB;

CREATE TABLE project_media (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  project_id INT UNSIGNED NOT NULL,
  media_id INT UNSIGNED NOT NULL,
  caption VARCHAR(255) NULL,
  media_type ENUM('image','screenshot','video','gallery') NOT NULL DEFAULT 'gallery',
  sort_order INT NOT NULL DEFAULT 0,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (media_id) REFERENCES media(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE project_technologies (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  project_id INT UNSIGNED NOT NULL,
  name VARCHAR(100) NOT NULL,
  icon VARCHAR(60) NULL,
  sort_order INT NOT NULL DEFAULT 0,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE project_tags (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(80) NOT NULL UNIQUE,
  slug VARCHAR(100) NOT NULL UNIQUE
) ENGINE=InnoDB;

CREATE TABLE project_tag_pivot (
  project_id INT UNSIGNED NOT NULL,
  tag_id INT UNSIGNED NOT NULL,
  PRIMARY KEY (project_id, tag_id),
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (tag_id) REFERENCES project_tags(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE project_features (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  project_id INT UNSIGNED NOT NULL,
  title VARCHAR(200) NOT NULL,
  description TEXT NULL,
  icon VARCHAR(60) NULL,
  sort_order INT NOT NULL DEFAULT 0,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE project_timeline (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  project_id INT UNSIGNED NOT NULL,
  title VARCHAR(200) NOT NULL,
  description TEXT NULL,
  event_date DATE NULL,
  sort_order INT NOT NULL DEFAULT 0,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ─── Blog ───────────────────────────────────────────────────────────────────

CREATE TABLE blog_categories (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  slug VARCHAR(140) NOT NULL UNIQUE,
  description TEXT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE blog_tags (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(80) NOT NULL UNIQUE,
  slug VARCHAR(100) NOT NULL UNIQUE
) ENGINE=InnoDB;

CREATE TABLE blog_posts (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  slug VARCHAR(255) NOT NULL UNIQUE,
  excerpt TEXT NULL,
  content LONGTEXT NULL,
  content_format ENUM('html','markdown') NOT NULL DEFAULT 'html',
  cover_media_id INT UNSIGNED NULL,
  category_id INT UNSIGNED NULL,
  status ENUM('draft','published','archived') NOT NULL DEFAULT 'draft',
  reading_time INT UNSIGNED NULL,
  toc_json JSON NULL,
  seo_title VARCHAR(255) NULL,
  seo_description TEXT NULL,
  seo_keywords VARCHAR(500) NULL,
  og_image_id INT UNSIGNED NULL,
  published_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (cover_media_id) REFERENCES media(id) ON DELETE SET NULL,
  FOREIGN KEY (category_id) REFERENCES blog_categories(id) ON DELETE SET NULL,
  FOREIGN KEY (og_image_id) REFERENCES media(id) ON DELETE SET NULL,
  INDEX idx_blog_status (status),
  INDEX idx_blog_published (published_at),
  FULLTEXT INDEX ft_blog (title, excerpt)
) ENGINE=InnoDB;

CREATE TABLE blog_post_tags (
  post_id INT UNSIGNED NOT NULL,
  tag_id INT UNSIGNED NOT NULL,
  PRIMARY KEY (post_id, tag_id),
  FOREIGN KEY (post_id) REFERENCES blog_posts(id) ON DELETE CASCADE,
  FOREIGN KEY (tag_id) REFERENCES blog_tags(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ─── Services, testimonials, contact ────────────────────────────────────────

CREATE TABLE services (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(200) NOT NULL,
  slug VARCHAR(220) NOT NULL UNIQUE,
  short_description TEXT NULL,
  description LONGTEXT NULL,
  icon VARCHAR(60) NULL,
  media_id INT UNSIGNED NULL,
  price_label VARCHAR(120) NULL,
  features JSON NULL,
  sort_order INT NOT NULL DEFAULT 0,
  is_visible TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (media_id) REFERENCES media(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE testimonials (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  author_name VARCHAR(120) NOT NULL,
  author_role VARCHAR(200) NULL,
  author_company VARCHAR(200) NULL,
  content TEXT NOT NULL,
  rating TINYINT UNSIGNED NULL,
  avatar_media_id INT UNSIGNED NULL,
  sort_order INT NOT NULL DEFAULT 0,
  is_visible TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (avatar_media_id) REFERENCES media(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE contact_info (
  id TINYINT UNSIGNED PRIMARY KEY DEFAULT 1,
  email VARCHAR(255) NULL,
  phone VARCHAR(60) NULL,
  address TEXT NULL,
  city VARCHAR(120) NULL,
  country VARCHAR(120) NULL,
  map_embed TEXT NULL,
  map_lat DECIMAL(10,7) NULL,
  map_lng DECIMAL(10,7) NULL,
  form_enabled TINYINT(1) NOT NULL DEFAULT 1,
  form_success_message TEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE contact_messages (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  email VARCHAR(255) NOT NULL,
  subject VARCHAR(255) NULL,
  message TEXT NOT NULL,
  ip_address VARCHAR(45) NULL,
  user_agent VARCHAR(500) NULL,
  is_read TINYINT(1) NOT NULL DEFAULT 0,
  honeypot VARCHAR(120) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_contact_read (is_read),
  INDEX idx_contact_created (created_at)
) ENGINE=InnoDB;

-- ─── Navigation & footer ────────────────────────────────────────────────────

CREATE TABLE navigation_items (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  label VARCHAR(120) NOT NULL,
  href VARCHAR(500) NOT NULL,
  target ENUM('_self','_blank') NOT NULL DEFAULT '_self',
  parent_id INT UNSIGNED NULL,
  location ENUM('header','footer','both') NOT NULL DEFAULT 'header',
  sort_order INT NOT NULL DEFAULT 0,
  is_visible TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (parent_id) REFERENCES navigation_items(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE footer_settings (
  id TINYINT UNSIGNED PRIMARY KEY DEFAULT 1,
  copyright_text VARCHAR(500) NULL,
  tagline TEXT NULL,
  show_social TINYINT(1) NOT NULL DEFAULT 1,
  columns_json JSON NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- ─── Homepage & pages ───────────────────────────────────────────────────────

CREATE TABLE homepage_sections (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  section_key VARCHAR(80) NOT NULL UNIQUE,
  title VARCHAR(255) NULL,
  subtitle TEXT NULL,
  content LONGTEXT NULL,
  cta_label VARCHAR(120) NULL,
  cta_href VARCHAR(500) NULL,
  secondary_cta_label VARCHAR(120) NULL,
  secondary_cta_href VARCHAR(500) NULL,
  media_id INT UNSIGNED NULL,
  is_visible TINYINT(1) NOT NULL DEFAULT 1,
  sort_order INT NOT NULL DEFAULT 0,
  settings_json JSON NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (media_id) REFERENCES media(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE hero_settings (
  id TINYINT UNSIGNED PRIMARY KEY DEFAULT 1,
  headline VARCHAR(255) NULL,
  subheadline TEXT NULL,
  badge_text VARCHAR(120) NULL,
  primary_cta_label VARCHAR(120) NULL,
  primary_cta_href VARCHAR(500) NULL,
  secondary_cta_label VARCHAR(120) NULL,
  secondary_cta_href VARCHAR(500) NULL,
  background_media_id INT UNSIGNED NULL,
  show_scroll_indicator TINYINT(1) NOT NULL DEFAULT 1,
  animation_style VARCHAR(60) NULL DEFAULT 'fade',
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (background_media_id) REFERENCES media(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE pages (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  slug VARCHAR(255) NOT NULL UNIQUE,
  content LONGTEXT NULL,
  layout_json LONGTEXT NULL,
  status ENUM('draft','published') NOT NULL DEFAULT 'published',
  seo_title VARCHAR(255) NULL,
  seo_description TEXT NULL,
  template VARCHAR(60) NOT NULL DEFAULT 'default',
  is_home TINYINT(1) NOT NULL DEFAULT 0,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_pages_is_home (is_home)
) ENGINE=InnoDB;

-- ─── SEO & settings ─────────────────────────────────────────────────────────

CREATE TABLE seo_settings (
  id TINYINT UNSIGNED PRIMARY KEY DEFAULT 1,
  site_title VARCHAR(255) NULL,
  site_description TEXT NULL,
  site_keywords VARCHAR(500) NULL,
  canonical_base_url VARCHAR(500) NULL,
  og_title VARCHAR(255) NULL,
  og_description TEXT NULL,
  og_image_id INT UNSIGNED NULL,
  twitter_card VARCHAR(40) NULL DEFAULT 'summary_large_image',
  twitter_handle VARCHAR(80) NULL,
  twitter_title VARCHAR(255) NULL,
  twitter_description TEXT NULL,
  twitter_image_id INT UNSIGNED NULL,
  favicon_media_id INT UNSIGNED NULL,
  apple_touch_icon_id INT UNSIGNED NULL,
  robots_txt TEXT NULL,
  structured_data_json JSON NULL,
  google_analytics_id VARCHAR(60) NULL,
  google_tag_manager_id VARCHAR(60) NULL,
  custom_head_scripts TEXT NULL,
  custom_body_scripts TEXT NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (og_image_id) REFERENCES media(id) ON DELETE SET NULL,
  FOREIGN KEY (twitter_image_id) REFERENCES media(id) ON DELETE SET NULL,
  FOREIGN KEY (favicon_media_id) REFERENCES media(id) ON DELETE SET NULL,
  FOREIGN KEY (apple_touch_icon_id) REFERENCES media(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE site_settings (
  id TINYINT UNSIGNED PRIMARY KEY DEFAULT 1,
  site_name VARCHAR(200) NOT NULL DEFAULT 'Jasefly CMS',
  logo_media_id INT UNSIGNED NULL,
  logo_dark_media_id INT UNSIGNED NULL,
  maintenance_mode TINYINT(1) NOT NULL DEFAULT 0,
  timezone VARCHAR(60) NOT NULL DEFAULT 'UTC',
  locale VARCHAR(20) NOT NULL DEFAULT 'en',
  posts_per_page INT UNSIGNED NOT NULL DEFAULT 9,
  projects_per_page INT UNSIGNED NOT NULL DEFAULT 12,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (logo_media_id) REFERENCES media(id) ON DELETE SET NULL,
  FOREIGN KEY (logo_dark_media_id) REFERENCES media(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE theme_settings (
  id TINYINT UNSIGNED PRIMARY KEY DEFAULT 1,
  preset VARCHAR(60) NOT NULL DEFAULT 'midnight',
  primary_color VARCHAR(20) NOT NULL DEFAULT '#3b82f6',
  accent_color VARCHAR(20) NOT NULL DEFAULT '#60a5fa',
  background_color VARCHAR(20) NOT NULL DEFAULT '#06080c',
  surface_color VARCHAR(20) NOT NULL DEFAULT '#0e1219',
  text_color VARCHAR(20) NOT NULL DEFAULT '#f4f6fa',
  muted_color VARCHAR(20) NOT NULL DEFAULT '#8b95a8',
  font_display VARCHAR(80) NOT NULL DEFAULT 'Sora',
  font_body VARCHAR(80) NOT NULL DEFAULT 'DM Sans',
  border_radius VARCHAR(20) NOT NULL DEFAULT '14px',
  glass_opacity DECIMAL(3,2) NOT NULL DEFAULT 0.08,
  custom_css TEXT NULL,
  custom_html TEXT NULL,
  custom_js TEXT NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE email_settings (
  id TINYINT UNSIGNED PRIMARY KEY DEFAULT 1,
  mailer ENUM('php','smtp') NOT NULL DEFAULT 'php',
  from_email VARCHAR(255) NULL,
  from_name VARCHAR(120) NULL,
  to_email VARCHAR(255) NULL,
  smtp_host VARCHAR(255) NULL,
  smtp_port INT UNSIGNED NULL DEFAULT 587,
  smtp_username VARCHAR(255) NULL,
  smtp_password VARCHAR(255) NULL,
  smtp_encryption ENUM('none','tls','ssl') NOT NULL DEFAULT 'tls',
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE settings_kv (
  setting_key VARCHAR(120) PRIMARY KEY,
  setting_value LONGTEXT NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

SET FOREIGN_KEY_CHECKS = 1;
