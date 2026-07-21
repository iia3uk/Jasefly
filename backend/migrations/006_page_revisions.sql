-- Page revisions + scheduled publish.
-- Tracks layout snapshots for rollback and adds published_at for scheduling.

CREATE TABLE IF NOT EXISTS `page_revisions` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `page_id` INT UNSIGNED NOT NULL,
  `layout_json` LONGTEXT NULL,
  `content` LONGTEXT NULL,
  `title` VARCHAR(255) NULL,
  `author_id` INT UNSIGNED NULL,
  `note` VARCHAR(255) NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_page_revisions_page` (`page_id`),
  INDEX `idx_page_revisions_created` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

ALTER TABLE `pages` ADD COLUMN `published_at` DATETIME NULL DEFAULT NULL;
ALTER TABLE `pages` ADD COLUMN `scheduled_at` DATETIME NULL DEFAULT NULL;
