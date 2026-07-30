-- Richer settings / profile fields for InstantCMS-like admin UX
ALTER TABLE `ai_aco_settings`
  ADD COLUMN `temperature` DECIMAL(3,2) NOT NULL DEFAULT 0.40 AFTER `batch_size`,
  ADD COLUMN `max_tokens` INT UNSIGNED NOT NULL DEFAULT 6000 AFTER `temperature`,
  ADD COLUMN `web_search` TINYINT(1) NOT NULL DEFAULT 0 AFTER `max_tokens`;

ALTER TABLE `ai_aco_profiles`
  ADD COLUMN `body_field` VARCHAR(60) NULL AFTER `content_type`,
  ADD COLUMN `excerpt_field` VARCHAR(60) NULL AFTER `body_field`,
  ADD COLUMN `scan_limit` INT UNSIGNED NOT NULL DEFAULT 50 AFTER `batch_limit`,
  ADD COLUMN `reupdate_days` INT UNSIGNED NOT NULL DEFAULT 180 AFTER `interval_hours`,
  ADD COLUMN `published_only` TINYINT(1) NOT NULL DEFAULT 1 AFTER `reupdate_days`,
  ADD COLUMN `scheduler_enabled` TINYINT(1) NOT NULL DEFAULT 1 AFTER `published_only`,
  ADD COLUMN `min_source_chars` INT UNSIGNED NOT NULL DEFAULT 300 AFTER `min_chars`,
  ADD COLUMN `min_result_chars` INT UNSIGNED NOT NULL DEFAULT 800 AFTER `min_source_chars`,
  ADD COLUMN `field_modes_json` JSON NULL AFTER `fields_json`;

ALTER TABLE `ai_aco_log`
  ADD COLUMN `result_json` LONGTEXT NULL AFTER `message`;

ALTER TABLE `ai_aco_backups`
  ADD COLUMN `applied_json` LONGTEXT NULL AFTER `after_json`;
