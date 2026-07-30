-- Overload protection: recorded load-average trips
CREATE TABLE IF NOT EXISTS `overload_events` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `load_1` DECIMAL(10,2) NOT NULL,
  `load_5` DECIMAL(10,2) NULL,
  `load_15` DECIMAL(10,2) NULL,
  `threshold` DECIMAL(10,2) NOT NULL,
  `mode` VARCHAR(32) NOT NULL DEFAULT 'log',
  `closed_site` TINYINT(1) NOT NULL DEFAULT 0,
  `notified` TINYINT(1) NOT NULL DEFAULT 0,
  `note` VARCHAR(255) NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_overload_created` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
