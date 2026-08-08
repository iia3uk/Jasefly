-- Cache for overlay / warmup translations (hash of source text + langs).
CREATE TABLE IF NOT EXISTS `translate_cache` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `source_lang` VARCHAR(8) NOT NULL,
  `target_lang` VARCHAR(8) NOT NULL,
  `source_hash` CHAR(64) NOT NULL,
  `source_text` TEXT NOT NULL,
  `translated_text` TEXT NOT NULL,
  `provider` VARCHAR(40) NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_translate_cache` (`source_lang`, `target_lang`, `source_hash`),
  KEY `idx_translate_target` (`target_lang`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
