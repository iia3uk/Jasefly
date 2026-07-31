-- Spirit upgrade marker (columns added by ensureSchema on boot/settings).
-- UPDATE avoids PDO unbuffered leftover from SELECT in migrations.
UPDATE `jasefly_character_settings` SET `updated_at` = `updated_at` WHERE `id` = 1;
