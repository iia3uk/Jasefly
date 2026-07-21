<?php
declare(strict_types=1);

/**
 * Lightweight diagnostics — open /api/public/diag.php then DELETE this file.
 */
header('Content-Type: application/json; charset=utf-8');

$root = dirname(__DIR__);
$out = [
    'php' => PHP_VERSION,
    'pdo_mysql' => extension_loaded('pdo_mysql'),
    'root' => $root,
    'config_local' => is_file("$root/config/config.local.php"),
    'installed_lock' => is_file("$root/storage/.installed"),
    'bootstrap' => is_file("$root/src/Bootstrap.php"),
    'writable_storage' => is_writable("$root/storage") || @is_writable("$root/storage"),
    'error_log_exists' => is_file("$root/storage/logs/error.log"),
    'error_log_tail' => null,
    'db' => null,
];

if ($out['error_log_exists']) {
    $tail = @file("$root/storage/logs/error.log");
    if (is_array($tail) && $tail) {
        $out['error_log_tail'] = array_slice($tail, -20);
    }
}

if ($out['config_local']) {
    try {
        $local = require "$root/config/config.local.php";
        $out['db'] = [
            'host' => $local['db_host'] ?? null,
            'name' => $local['db_name'] ?? null,
            'user' => $local['db_user'] ?? null,
            'has_pass' => isset($local['db_pass']) && $local['db_pass'] !== '',
            'jwt_set' => !empty($local['jwt_secret']),
        ];
        $pdo = new PDO(
            sprintf(
                'mysql:host=%s;dbname=%s;charset=%s',
                $local['db_host'] ?? 'localhost',
                $local['db_name'] ?? '',
                $local['db_charset'] ?? 'utf8mb4'
            ),
            $local['db_user'] ?? '',
            $local['db_pass'] ?? '',
            [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]
        );
        $tables = $pdo->query('SHOW TABLES')->fetchAll(PDO::FETCH_COLUMN);
        $out['db']['ok'] = true;
        $out['db']['tables'] = count($tables);
        $out['db']['has_users'] = in_array('users', $tables, true);
    } catch (Throwable $e) {
        $out['db']['ok'] = false;
        $out['db']['error'] = $e->getMessage();
    }
} else {
    $out['hint'] = 'Run /install.php first — config.local.php is missing.';
}

echo json_encode($out, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
