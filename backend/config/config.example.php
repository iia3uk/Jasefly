<?php
/**
 * Copy to config.local.php or use install.php to generate this file.
 */
return [
    'app_url' => 'http://localhost:5173',
    'jwt_secret' => 'YOUR_JWT_SECRET',
    'jwt_ttl' => 3600,
    'refresh_ttl' => 604800,
    // Optional: dedicated key for encrypted backups; falls back to jwt_secret.
    // 'backup_key' => '...',
    // Prefer MCP_API_TOKEN in config/.env (see .env.example) — not committed.
    // 'mcp_api_token' => 'YOUR_MCP_TOKEN', // legacy; .env preferred
    'cors_origins' => 'http://localhost:5173',
    'upload_max_mb' => 10,
    'db_host' => 'localhost',
    'db_name' => 'jasefly_cms',
    'db_user' => 'YOUR_DB_USER',
    'db_pass' => 'YOUR_DB_PASSWORD',
    'db_charset' => 'utf8mb4',
];
