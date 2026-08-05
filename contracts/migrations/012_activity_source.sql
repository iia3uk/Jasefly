-- Activity log: distinguish admin UI vs MCP agent actions
ALTER TABLE `activity_logs`
  ADD COLUMN `source` VARCHAR(20) NOT NULL DEFAULT 'admin' AFTER `user_name`;

CREATE INDEX `idx_activity_source` ON `activity_logs` (`source`);
