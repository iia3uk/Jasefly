-- Anti-replay store for MCP dual-secret HMAC nonces (shared-hosting safe).

CREATE TABLE IF NOT EXISTS mcp_nonces (
  nonce VARCHAR(128) NOT NULL,
  expires_at DATETIME NOT NULL,
  PRIMARY KEY (nonce)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_mcp_nonces_expires ON mcp_nonces (expires_at);
