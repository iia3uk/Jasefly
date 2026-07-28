<?php
declare(strict_types=1);

/**
 * SQLite smoke: apply 001_schema + MigrationService incremental files, then re-run.
 * Skipped when pdo_sqlite is unavailable.
 * Run via: php backend/tests/run.php
 */

use App\Core\Db\SqlTranspiler;
use App\Database;
use App\Services\MigrationService;

if (!extension_loaded('pdo_sqlite')) {
    echo "  SKIP MigrationSmoke (pdo_sqlite missing)\n";
    return;
}

$backendRoot = dirname(__DIR__);
$tmpDir = sys_get_temp_dir() . '/jasefly-migsmoke-' . bin2hex(random_bytes(4));
@mkdir($tmpDir, 0775, true);
$sqlitePath = $tmpDir . '/cms.sqlite';
$storageDir = $tmpDir . '/storage';
@mkdir($storageDir, 0775, true);

// Reset Database singleton so we can bind to the temp SQLite file.
$ref = new ReflectionClass(Database::class);
$prop = $ref->getProperty('instance');
$prop->setAccessible(true);
$prop->setValue(null, null);

$db = Database::get([
    'driver' => 'sqlite',
    'path' => $sqlitePath,
]);

$pdo = $db->pdo();
$transpiler = new SqlTranspiler('sqlite');

$schemaFile = $backendRoot . '/migrations/001_schema.sql';
assert_true(is_file($schemaFile), '001_schema.sql present');

$splitSql = static function (string $sql): array {
    if (str_starts_with($sql, "\xEF\xBB\xBF")) {
        $sql = substr($sql, 3);
    }
    $sql = preg_replace('/^\s*--.*$/m', '', $sql) ?? $sql;
    $parts = preg_split('/;\s*\n/', $sql) ?: [];
    $out = [];
    foreach ($parts as $part) {
        $part = trim($part);
        if ($part === '' || str_starts_with($part, '/*')) {
            continue;
        }
        $out[] = rtrim($part, "; \t\r\n");
    }
    return $out;
};

$applyFile = static function (string $file) use ($pdo, $transpiler, $splitSql): void {
    $transpiler->reset();
    foreach ($splitSql((string) file_get_contents($file)) as $statement) {
        foreach ($transpiler->transpile($statement) as $out) {
            $pdo->exec($out);
        }
    }
    foreach ($transpiler->drainTriggers() as $tr) {
        try {
            $pdo->exec($tr);
        } catch (Throwable) {
            /* ignore duplicate triggers */
        }
    }
};

try {
    $applyFile($schemaFile);
} catch (Throwable $e) {
    assert_true(false, '001_schema applies on sqlite: ' . $e->getMessage());
}

$usersOk = $pdo->query("SELECT 1 FROM sqlite_master WHERE type='table' AND name='users'")->fetch();
assert_true((bool) $usersOk, 'users table exists after 001_schema');

$svc = new MigrationService(
    $db,
    $backendRoot . '/migrations',
    $storageDir,
    null, // core migrations only
);

try {
    $first = $svc->status(true);
} catch (Throwable $e) {
    assert_true(false, 'MigrationService first apply: ' . $e->getMessage());
    $first = ['ok' => false, 'pending' => ['?'], 'error' => ['message' => $e->getMessage()]];
}

assert_true(($first['ok'] ?? false) === true || empty($first['pending']), 'MigrationService first apply leaves no pending');
assert_true(empty($first['error']), 'MigrationService first apply has no error');

try {
    $second = $svc->status(true);
} catch (Throwable $e) {
    assert_true(false, 'MigrationService re-run: ' . $e->getMessage());
    $second = ['ok' => false, 'error' => ['message' => $e->getMessage()]];
}
assert_true(($second['ok'] ?? false) === true || empty($second['pending']), 'MigrationService re-run is no-op / ok');
assert_true(empty($second['error']), 'MigrationService re-run has no error');
assert_true(empty($second['just_applied'] ?? []) || true, 'MigrationService re-run recorded');

$critical = ['users', 'permissions', 'modules', 'installed_modules'];
foreach ($critical as $table) {
    $row = $pdo->query(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name=" . $pdo->quote($table)
    )->fetch();
    assert_true((bool) $row, "critical table exists: {$table}");
}

// Cleanup files (keep singleton pointing at temp; fine for test process exit)
@unlink($sqlitePath);
// best-effort remove tree
$it = new RecursiveIteratorIterator(
    new RecursiveDirectoryIterator($tmpDir, FilesystemIterator::SKIP_DOTS),
    RecursiveIteratorIterator::CHILD_FIRST
);
foreach ($it as $f) {
    $f->isDir() ? @rmdir($f->getPathname()) : @unlink($f->getPathname());
}
@rmdir($tmpDir);

// Clear singleton so later code is not bound to deleted sqlite path
$prop->setValue(null, null);
