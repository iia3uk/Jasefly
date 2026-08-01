CREATE TABLE IF NOT EXISTS `wallet_balances` (
  `user_id` INT UNSIGNED NOT NULL,
  `currency` VARCHAR(32) NOT NULL DEFAULT 'credits',
  `balance` DECIMAL(18, 4) NOT NULL DEFAULT 0,
  `updated_at` DATETIME NULL,
  PRIMARY KEY (`user_id`, `currency`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `wallet_ledger` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `user_id` INT UNSIGNED NOT NULL,
  `currency` VARCHAR(32) NOT NULL DEFAULT 'credits',
  `delta` DECIMAL(18, 4) NOT NULL,
  `reason` VARCHAR(191) NULL,
  `created_at` DATETIME NULL,
  KEY `idx_wallet_ledger_user` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
