-- Showcase lead: higher featured_priority wins among featured projects.
ALTER TABLE projects ADD COLUMN featured_priority INT NOT NULL DEFAULT 0;