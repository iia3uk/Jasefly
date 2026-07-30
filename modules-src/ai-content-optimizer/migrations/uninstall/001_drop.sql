DROP TABLE IF EXISTS `ai_aco_log`;
DROP TABLE IF EXISTS `ai_aco_backups`;
DROP TABLE IF EXISTS `ai_aco_cursors`;
DROP TABLE IF EXISTS `ai_aco_profiles`;
DROP TABLE IF EXISTS `ai_aco_settings`;
DELETE FROM `cron_schedules` WHERE `name`='ai-content-optimizer.tick';
