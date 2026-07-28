<?php
declare(strict_types=1);

/**
 * Shared SQLite bootstrap helpers for backend/tests (no PHPUnit).
 */

use App\Core\Db\SqlTranspiler;
use App\Database;
use App\Services\MigrationService;

/**
 * @return array{db: Database, pdo: PDO, tmpDir: string, sqlitePath: string, storageDir: string, applyFile: callable, cleanup: callable}
 */
function jasefly_test_sqlite_boot(): array
{
    if (!extension_loaded('pdo_sqlite')) {
        throw new RuntimeException('pdo_sqlite missing');
    }

    $backendRoot = dirname(__DIR__);
    $tmpDir = sys_get_temp_dir() . '/jasefly-test-' . bin2hex(random_bytes(4));
    @mkdir($tmpDir, 0775, true);
    $sqlitePath = $tmpDir . '/cms.sqlite';
    $storageDir = $tmpDir . '/storage';
    @mkdir($storageDir, 0775, true);

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

    $isIgnorable = static function (string $msg): bool {
        $m = strtolower($msg);
        return str_contains($m, 'duplicate column')
            || str_contains($m, 'already exists')
            || str_contains($m, 'duplicate key')
            || str_contains($m, 'duplicate column name')
            || str_contains($m, 'column already exists')
            || str_contains($m, 'duplicate object')
            || str_contains($m, '1050')
            || str_contains($m, '1060')
            || str_contains($m, '1061')
            || str_contains($m, '1062')
            || str_contains($m, 'unique constraint failed');
    };

    $applyFile = static function (string $file) use ($pdo, $transpiler, $splitSql, $isIgnorable): void {
        $transpiler->reset();
        foreach ($splitSql((string) file_get_contents($file)) as $statement) {
            foreach ($transpiler->transpile($statement) as $out) {
                try {
                    $pdo->exec($out);
                } catch (Throwable $e) {
                    // Match MigrationService: redundant ADD COLUMN from historical overlap is OK.
                    if ($isIgnorable($e->getMessage())) {
                        continue;
                    }
                    throw $e;
                }
            }
        }
        foreach ($transpiler->drainTriggers() as $tr) {
            try {
                $pdo->exec($tr);
            } catch (Throwable) {
            }
        }
    };

    $cleanup = static function () use ($tmpDir, $prop): void {
        $prop->setValue(null, null);
        if (!is_dir($tmpDir)) {
            return;
        }
        $it = new RecursiveIteratorIterator(
            new RecursiveDirectoryIterator($tmpDir, FilesystemIterator::SKIP_DOTS),
            RecursiveIteratorIterator::CHILD_FIRST
        );
        foreach ($it as $f) {
            $f->isDir() ? @rmdir($f->getPathname()) : @unlink($f->getPathname());
        }
        @rmdir($tmpDir);
    };

    return [
        'db' => $db,
        'pdo' => $pdo,
        'tmpDir' => $tmpDir,
        'sqlitePath' => $sqlitePath,
        'storageDir' => $storageDir,
        'backendRoot' => $backendRoot,
        'applyFile' => $applyFile,
        'cleanup' => $cleanup,
    ];
}

/**
 * Apply 001_schema + all MigrationService core files.
 *
 * @param array{db: Database, applyFile: callable, backendRoot: string, storageDir: string} $ctx
 */
function jasefly_test_apply_core_schema(array $ctx): MigrationService
{
    $backendRoot = $ctx['backendRoot'];
    ($ctx['applyFile'])($backendRoot . '/migrations/001_schema.sql');
    $svc = new MigrationService($ctx['db'], $backendRoot . '/migrations', $ctx['storageDir'], null);
    $result = $svc->status(true);
    if (!empty($result['error']) || !empty($result['pending'])) {
        $err = is_array($result['error'] ?? null)
            ? (($result['error']['message'] ?? '') . ' @ ' . ($result['error']['file'] ?? ''))
            : 'pending: ' . implode(',', $result['pending'] ?? []);
        throw new RuntimeException('Core schema migrate failed: ' . $err);
    }
    return $svc;
}
