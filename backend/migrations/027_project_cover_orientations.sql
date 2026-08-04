-- Responsive project covers for showcase (portrait lead / landscape stack & mobile).
ALTER TABLE projects ADD COLUMN cover_portrait_media_id INT UNSIGNED NULL;
ALTER TABLE projects ADD COLUMN cover_landscape_media_id INT UNSIGNED NULL;
