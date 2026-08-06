-- Platform shell plugins ON after clean install / upgrade.
-- Optional plugins stay off until explicitly enabled (no row or is_enabled=0).
-- Does not disable already-enabled plugins.

INSERT IGNORE INTO `modules` (`name`, `is_enabled`) VALUES
  ('system', 1),
  ('users', 1),
  ('content', 1),
  ('media', 1),
  ('seo', 1);
