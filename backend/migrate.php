<?php
declare(strict_types=1);

/**
 * Incremental DB migrations (CLI / one-shot web).
 * Prefer auto-migrate from the admin panel; this remains for hosting update packages.
 *
 * CLI:  php migrate.php
 * Web:  open /migrate.php once, then DELETE the file.
 */

$root = __DIR__;
$configFile = "$root/config/config.local.php";
if (!is_file($configFile)) {
    http_response_code(500);
    header('Content-Type: text/plain; charset=utf-8');
    echo "Missing config/config.local.php — run install first or restore config.\n";
    exit(1);
}

require_once "$root/src/Bootstrap.php";

use App\Bootstrap;
use App\Services\MigrationService;

[$app, $db] = Bootstrap::init();

$svc = new MigrationService(
    $db,
    "$root/migrations",
    (string) ($app['storage'] ?? "$root/storage"),
    "$root/src/Modules"
);

if (PHP_SAPI !== 'cli') {
    header('Content-Type: text/html; charset=utf-8');
    echo '<!doctype html><meta charset="utf-8"><title>Jasefly CMS migrate</title><pre style="font:14px/1.45 ui-monospace,monospace;padding:1.5rem">';
}

echo "Jasefly CMS — incremental migrations\n";
echo str_repeat('-', 40) . "\n";

$result = $svc->status(true);

foreach ($result['just_applied'] ?? [] as $row) {
    $file = is_array($row) ? ($row['file'] ?? '?') : $row;
    echo "[OK] applied {$file}\n";
}
foreach ($result['pending'] ?? [] as $file) {
    echo "[!!] still pending: {$file}\n";
}

if (!empty($result['error'])) {
    $err = $result['error'];
    echo "[XX] FAILED: " . ($err['file'] ?? '?') . "\n";
    echo ($err['message'] ?? '') . "\n";
    if (!empty($err['sql_preview'])) {
        echo "SQL: {$err['sql_preview']}\n";
    }
    echo "Open /admin — red migration banner, or POST /api/v1/admin/migrations/retry\n";
    if (PHP_SAPI !== 'cli') {
        echo '</pre>';
    }
    exit(1);
}

if (empty($result['pending'])) {
    echo "[OK] database is up to date\n";
}

echo str_repeat('-', 40) . "\n";
echo "Done. Delete migrate.php from the server after use.\n";

if (PHP_SAPI !== 'cli') {
    echo '</pre>';
}
