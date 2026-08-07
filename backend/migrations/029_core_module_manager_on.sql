-- module-manager is platform core (runtime-assets / ZIP lifecycle). Always ON.
-- INSERT IGNORE does not flip an existing is_enabled=0 row — UPDATE forces on.

INSERT IGNORE INTO `modules` (`name`, `is_enabled`) VALUES
  ('module-manager', 1);

UPDATE `modules` SET `is_enabled` = 1 WHERE `name` = 'module-manager';
