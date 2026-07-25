-- Demo Kit sample table (idempotent).

CREATE TABLE IF NOT EXISTS `demo_kit_items` (
  `id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `title` VARCHAR(190) NOT NULL,
  `note` TEXT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO `demo_kit_items` (`id`, `title`, `note`) VALUES
  (1, 'Welcome', 'Installed by demo-kit migration');
