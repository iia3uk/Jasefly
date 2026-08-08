-- Only when uninstall removes data (preserve_data_on_uninstall=true by default).
DROP TABLE IF EXISTS `form_submission_values`;
DROP TABLE IF EXISTS `form_submissions`;
DROP TABLE IF EXISTS `form_actions`;
DROP TABLE IF EXISTS `form_versions`;
DROP TABLE IF EXISTS `form_fields`;
DROP TABLE IF EXISTS `forms`;
