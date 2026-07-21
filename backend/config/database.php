<?php
declare(strict_types=1);

$local = is_file(__DIR__ . '/config.local.php') ? require __DIR__ . '/config.local.php' : [];
$env = static fn(string $key, mixed $default = ''): mixed => $_ENV[$key] ?? getenv($key) ?: $default;

$driver = strtolower((string) ($local['db_driver'] ?? $env('DB_DRIVER', 'mysql')));

return [
    'driver' => $driver,
    // MySQL / PostgreSQL:
    'host' => $local['db_host'] ?? $env('DB_HOST', 'localhost'),
    'port' => (string) ($local['db_port'] ?? $env('DB_PORT', $driver === 'pgsql' ? '5432' : '3306')),
    'name' => $local['db_name'] ?? $env('DB_NAME'),
    'user' => $local['db_user'] ?? $env('DB_USER'),
    'pass' => $local['db_pass'] ?? $env('DB_PASS'),
    'charset' => $local['db_charset'] ?? $env('DB_CHARSET', 'utf8mb4'),
    // SQLite only (relative paths resolve under the backend root):
    'path' => $local['db_path'] ?? $env('DB_PATH', 'storage/sqlite/cms.sqlite'),
];
