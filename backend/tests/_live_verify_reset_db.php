<?php
declare(strict_types=1);

/**
 * Reset jasefly_verify MySQL DB and apply 001_schema + MigrationService.
 * Usage: php backend/tests/_live_verify_reset_db.php
 */

$root = dirname(__DIR__);
require_once $root . '/src/Bootstrap.php';
\App\Bootstrap::registerAutoload();

$dbCfg = require $root . '/config/database.php';
$host = (string) $dbCfg['host'];
$port = (string) $dbCfg['port'];
$name = (string) $dbCfg['name'];
$user = (string) $dbCfg['user'];
$pass = (string) $dbCfg['pass'];

$admin = new PDO(
    "mysql:host={$host};port={$port};charset=utf8mb4",
    $user,
    $pass,
    [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]
);
$admin->exec("DROP DATABASE IF EXISTS `{$name}`");
$admin->exec("CREATE DATABASE `{$name}` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
echo "DB reset: {$name}\n";

$db = \App\Database::get($dbCfg);
$pdo = $db->pdo();
$t = new \App\Core\Db\SqlTranspiler('mysql');
$sql = (string) file_get_contents($root . '/migrations/001_schema.sql');
if (str_starts_with($sql, "\xEF\xBB\xBF")) {
    $sql = substr($sql, 3);
}
$sql = preg_replace('/^\s*--.*$/m', '', $sql) ?? $sql;
foreach (preg_split('/;\s*\n/', $sql) ?: [] as $part) {
    $part = trim($part);
    if ($part === '' || str_starts_with($part, '/*')) {
        continue;
    }
    $part = rtrim($part, "; \t\r\n");
    foreach ($t->transpile($part) as $out) {
        $pdo->exec($out);
    }
}
foreach ($t->drainTriggers() as $tr) {
    try {
        $pdo->exec($tr);
    } catch (Throwable) {
    }
}
echo "001_schema applied\n";

$app = require $root . '/config/app.php';
$svc = new \App\Services\MigrationService(
    $db,
    $root . '/migrations',
    (string) ($app['storage'] ?? $root . '/storage'),
    $root . '/src/Modules'
);
$result = $svc->status(true);
$pending = $result['pending'] ?? [];
$just = $result['just_applied'] ?? [];
echo 'migrate applied=' . count($just) . ' pending=' . count($pending) . "\n";
if (!empty($result['error'])) {
    fwrite(STDERR, 'Migration error: ' . json_encode($result['error'], JSON_UNESCAPED_UNICODE) . "\n");
    exit(1);
}
if ($pending !== []) {
    fwrite(STDERR, "Still pending:\n- " . implode("\n- ", $pending) . "\n");
    exit(1);
}
echo "OK\n";
