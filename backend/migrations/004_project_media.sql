-- Ensure project gallery table exists (existing installs may miss it)
CREATE TABLE IF NOT EXISTS project_media (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  project_id INT UNSIGNED NOT NULL,
  media_id INT UNSIGNED NOT NULL,
  caption VARCHAR(255) NULL,
  media_type ENUM('image','screenshot','video','gallery') NOT NULL DEFAULT 'gallery',
  sort_order INT NOT NULL DEFAULT 0,
  INDEX idx_project_media_project (project_id),
  INDEX idx_project_media_media (media_id)
) ENGINE=InnoDB;
