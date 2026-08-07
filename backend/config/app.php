<?php
declare(strict_types=1);

$local = is_file(__DIR__ . '/config.local.php') ? require __DIR__ . '/config.local.php' : [];
$env = static fn(string $key, mixed $default = null): mixed => $_ENV[$key] ?? getenv($key) ?: ($local[$key] ?? $default);

return [
    'name' => (string) ($local['app_name'] ?? $env('APP_NAME', 'Jasefly')),
    'url' => rtrim((string) ($local['app_url'] ?? $env('APP_URL', 'http://localhost')), '/'),
    'env' => (string) ($local['app_env'] ?? $env('APP_ENV', 'production')),
    'timezone' => (string) ($local['timezone'] ?? $env('APP_TIMEZONE', 'Europe/Moscow')),
    'version' => (string) ($local['app_version'] ?? $env('APP_VERSION', '1.0.0')),

    'jwt_secret' => (string) ($local['jwt_secret'] ?? $env('JWT_SECRET', '')),
    'jwt_ttl' => (int) ($local['jwt_ttl'] ?? $env('JWT_TTL', 3600)),
    'refresh_ttl' => (int) ($local['refresh_ttl'] ?? $env('REFRESH_TTL', 604800)),

    'upload_max_mb' => (int) ($local['upload_max_mb'] ?? $env('UPLOAD_MAX_MB', 10)),
    // Optional dedicated key for encrypted backups; falls back to jwt_secret.
    'backup_key' => (string) ($local['backup_key'] ?? $env('BACKUP_KEY', '')),
    // Long-lived Bearer token for MCP / CI (optional). Prefer over password+2FA for agents.
    'mcp_api_token' => (string) ($local['mcp_api_token'] ?? $env('MCP_API_TOKEN', '')),
    // Second secret for HMAC proof-of-possession (never sent on the wire). Empty → legacy Bearer-only.
    'mcp_signing_secret' => (string) ($local['mcp_signing_secret'] ?? $env('MCP_SIGNING_SECRET', '')),
    // legacy | prefer | require — empty signing secret forces legacy.
    'mcp_auth_mode' => (string) ($local['mcp_auth_mode'] ?? $env('MCP_AUTH_MODE', 'legacy')),
    // Optional CIDR/IP allowlist for MCP Bearer (empty = off).
    'mcp_allowed_ips' => (string) ($local['mcp_allowed_ips'] ?? $env('MCP_ALLOWED_IPS', '')),
    'mcp_skew_seconds' => (int) ($local['mcp_skew_seconds'] ?? $env('MCP_SKEW_SECONDS', 300)),

    // Opt-in human gate for CMS update ZIP (Telegram Approve). Secrets only in .env — not Mail DB.
    'telegram_deploy_approve' => (string) ($local['telegram_deploy_approve'] ?? $env('TELEGRAM_DEPLOY_APPROVE', '0')),
    'telegram_deploy_bot_token' => (string) ($local['telegram_deploy_bot_token'] ?? $env('TELEGRAM_DEPLOY_BOT_TOKEN', '')),
    'telegram_deploy_chat_id' => (string) ($local['telegram_deploy_chat_id'] ?? $env('TELEGRAM_DEPLOY_CHAT_ID', '')),
    'telegram_deploy_webhook_secret' => (string) ($local['telegram_deploy_webhook_secret'] ?? $env('TELEGRAM_DEPLOY_WEBHOOK_SECRET', '')),
    'telegram_deploy_ttl_seconds' => (int) ($local['telegram_deploy_ttl_seconds'] ?? $env('TELEGRAM_DEPLOY_TTL_SECONDS', 3600)),

    'cors_origins' => array_filter(array_map('trim', explode(',', (string) (
        $local['cors_origins'] ?? $env('CORS_ORIGINS', '')
    )))),
    'storage' => dirname(__DIR__) . '/storage',

    'api' => [
        // Active versions served simultaneously
        'versions' => ['/api/v1', '/api'],
        'default' => 'v1',
    ],

    'modules' => [
        // Disable modules without deleting code: ['blog', 'testimonials']
        'disabled' => array_filter(array_map('trim', explode(',', (string) (
            $local['modules_disabled'] ?? $env('MODULES_DISABLED', '')
        )))),
        // Optional explicit class list in addition to auto-discovery
        'register' => [],
    ],

    // Universal ZIP quarantine budgets (ModuleQuarantinePolicy).
    'module_quarantine' => [
        'bootstrap_timeout_sec' => (float) ($local['module_quarantine_timeout'] ?? $env('MODULE_QUARANTINE_TIMEOUT', 5)),
        'memory_delta_bytes' => (int) ($local['module_quarantine_memory_delta'] ?? $env('MODULE_QUARANTINE_MEMORY_DELTA', 67108864)),
        'memory_headroom_bytes' => (int) ($local['module_quarantine_memory_headroom'] ?? $env('MODULE_QUARANTINE_MEMORY_HEADROOM', 8388608)),
    ],

    'pagination' => [
        'default_per_page' => (int) ($local['per_page'] ?? $env('PER_PAGE', 12)),
        'max_per_page' => (int) ($local['max_per_page'] ?? $env('MAX_PER_PAGE', 100)),
    ],

    'rate_limit' => [
        'max_attempts' => (int) ($local['rate_limit_max'] ?? $env('RATE_LIMIT_MAX', 20)),
        'window_seconds' => (int) ($local['rate_limit_window'] ?? $env('RATE_LIMIT_WINDOW', 60)),
    ],
];
