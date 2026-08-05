-- Demo Sandbox: isolated session overlays (no multi-site tenant model).

CREATE TABLE IF NOT EXISTS demo_sessions (
  id VARCHAR(64) NOT NULL,
  token_hash VARCHAR(64) NOT NULL,
  expires_at DATETIME NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_seen_at DATETIME NULL,
  ip_address VARCHAR(64) NULL,
  user_agent VARCHAR(255) NULL,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_demo_sessions_expires ON demo_sessions (expires_at);
CREATE INDEX idx_demo_sessions_token ON demo_sessions (token_hash);

CREATE TABLE IF NOT EXISTS demo_overlays (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  session_id VARCHAR(64) NOT NULL,
  resource_type VARCHAR(64) NOT NULL,
  resource_key VARCHAR(128) NOT NULL,
  payload_json LONGTEXT NOT NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_demo_overlay (session_id, resource_type, resource_key),
  INDEX idx_demo_overlays_session (session_id),
  CONSTRAINT fk_demo_overlays_session FOREIGN KEY (session_id) REFERENCES demo_sessions(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS demo_audit_log (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  session_id VARCHAR(64) NULL,
  action VARCHAR(64) NOT NULL,
  path VARCHAR(255) NULL,
  detail_json TEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_demo_audit_session (session_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
