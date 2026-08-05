-- Custom SPA admin base path (UI only; API stays /api/v1/admin).

ALTER TABLE `site_settings`
  ADD COLUMN `admin_base_path` VARCHAR(64) NULL DEFAULT NULL AFTER `cookie_policy_href`;
