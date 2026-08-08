-- Drop only when uninstall explicitly removes data (preserve_data_on_uninstall=true by default).
DROP TABLE IF EXISTS `analytics_goal_conversions`;
DROP TABLE IF EXISTS `analytics_goals`;
DROP TABLE IF EXISTS `analytics_daily_stats`;
DROP TABLE IF EXISTS `analytics_events`;
DROP TABLE IF EXISTS `analytics_sessions`;
DROP TABLE IF EXISTS `analytics_settings`;
