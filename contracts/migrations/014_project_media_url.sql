-- Allow gallery rows that are video URLs (no media file) or media files.
ALTER TABLE project_media
  MODIFY media_id INT UNSIGNED NULL;

ALTER TABLE project_media
  ADD COLUMN url VARCHAR(1024) NULL AFTER caption;
