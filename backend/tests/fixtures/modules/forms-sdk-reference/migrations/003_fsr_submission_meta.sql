-- Update-path test migration (1.0.0 → 1.1.0 lifecycle)

ALTER TABLE `fsr_form_submissions` ADD COLUMN `meta_json` JSON NULL;
