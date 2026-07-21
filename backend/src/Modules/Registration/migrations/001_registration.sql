-- Public self-registration support (columns may already exist — runner skips errors)

ALTER TABLE `users` ADD COLUMN `email_verified_at` DATETIME NULL;
ALTER TABLE `users` ADD COLUMN `email_verify_token` VARCHAR(64) NULL;
ALTER TABLE `users` ADD COLUMN `email_verify_expires_at` DATETIME NULL;
ALTER TABLE `users` ADD COLUMN `registration_source` VARCHAR(40) NULL DEFAULT NULL;

INSERT IGNORE INTO `roles` (`slug`, `name`, `description`, `is_system`)
VALUES ('member', 'Member', 'Публичный пользователь (саморегистрация). Без доступа в админку.', 1);
