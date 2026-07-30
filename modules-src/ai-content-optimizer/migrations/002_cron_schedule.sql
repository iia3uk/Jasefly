-- Optional cron row (inactive until enabled in module settings)
INSERT INTO `cron_schedules` (`name`, `expression`, `job_type`, `payload`, `is_active`)
SELECT 'ai-content-optimizer.tick', '0 * * * *', 'ai-content-optimizer.tick', '{}', 0
WHERE NOT EXISTS (SELECT 1 FROM `cron_schedules` WHERE `name` = 'ai-content-optimizer.tick');
