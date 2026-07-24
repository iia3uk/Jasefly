-- Target markets for schema.org areaServed (multi-select: CIS, EU, USA, ASIA).

ALTER TABLE `seo_settings`
  ADD COLUMN `target_regions` JSON NULL AFTER `site_keywords`;
