-- Extra indexes for fsr_form_submissions status filters

ALTER TABLE `fsr_form_submissions` ADD INDEX `idx_fsr_sub_status_created` (`status`, `created_at`);
