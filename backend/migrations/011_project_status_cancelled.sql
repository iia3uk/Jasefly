-- Add project lifecycle status: cancelled (Отменён)
ALTER TABLE projects
  MODIFY COLUMN project_status
  ENUM('completed','in_progress','on_hold','concept','cancelled')
  NOT NULL DEFAULT 'completed';
