<?php
declare(strict_types=1);

namespace App\Services;

use App\Core\Db\SqlTranspiler;
use App\Database;
use App\MigrationException;
use PDO;
use Throwable;

/**
 * Incremental SQL migrations for hosting updates.
 * Safe to re-run: duplicate column/key errors are skipped.
 *
 * Migrations are authored in a MySQL-canonical dialect; a {@see SqlTranspiler}
 * adapts them to the configured driver (mysql/sqlite/pgsql) at apply time.
 */
final class MigrationService
{
    /** Ordered migration files under /migrations (skip 001 — install only). */
    public const FILES = [
        '002_enterprise.sql',
        '003_site_templates.sql',
        '004_project_media.sql',
        '005_page_layouts.sql',
        '006_page_revisions.sql',
        '007_plugins.sql',
        '008_security_2fa.sql',
        '009_commerce_catalog.sql',
        '010_maintenance_settings.sql',
        '011_project_status_cancelled.sql',
        '012_activity_source.sql',
        '013_blog_project_link.sql',
        '014_project_media_url.sql',
        '015_path_redirects.sql',
        '016_cookie_consent.sql',
        '017_admin_base_path.sql',
        '018_harden_role_permissions.sql',
        '019_seo_target_regions.sql',
        '020_installed_modules.sql',
        '021_platform_sdk.sql',
        '022_platform_capabilities_ext.sql',
        '023_theme_header_style.sql',
        '024_admin_access_layer.sql',
        '025_demo_sandbox.sql',
        '026_project_featured_priority.sql',
        '027_project_cover_orientations.sql',
        '028_plugin_default_off_seed.sql',
    ];

    private SqlTranspiler $transpiler;

    public function __construct(
        private Database $db,
        private string $migrationsDir,
        private string $storageDir,
        private ?string $modulesDir = null,
    ) {
        $this->transpiler = new SqlTranspiler($db->driver());
    }

    public function status(bool $autoApply = true): array
    {
        $this->ensureMetaTables();

        $pending = $this->pendingFiles();
        $applied = $this->appliedFiles();
        $lastError = $this->readLastError();

        $ran = [];
        $ok = true;
        $error = null;

        if ($autoApply && $pending && !$this->isBlocked()) {
            $result = $this->applyPending();
            $ran = $result['applied'];
            $ok = $result['ok'];
            $error = $result['error'];
            $pending = $this->pendingFiles();
            $applied = $this->appliedFiles();
            $lastError = $this->readLastError();
        }

        return [
            'ok' => $ok && !$lastError && !$pending,
            'pending' => $pending,
            'applied' => $applied,
            'just_applied' => $ran,
            'blocked' => $this->isBlocked(),
            'error' => $lastError,
            'migrations_dir' => $this->migrationsDir,
        ];
    }

    public function retry(): array
    {
        $this->clearLastError();
        $this->unblock();
        return $this->status(true);
    }

    public function applyPending(): array
    {
        $this->ensureMetaTables();
        $lock = $this->acquireLock();
        if ($lock === false) {
            return [
                'ok' => true,
                'applied' => [],
                'error' => null,
                'message' => 'Another migration is running',
            ];
        }

        $applied = [];
        $error = null;

        try {
            $pluginFiles = $this->pluginMigrationFiles();
            foreach ($this->pendingFiles() as $file) {
                if (str_starts_with($file, 'plugin:')) {
                    $path = $pluginFiles[$file] ?? '';
                } else {
                    $path = rtrim($this->migrationsDir, '/\\') . DIRECTORY_SEPARATOR . $file;
                }
                if (!$path || !is_file($path)) {
                    continue;
                }
                try {
                    $stats = $this->runSqlFile($path);
                    $this->markApplied($file);
                    $applied[] = [
                        'file' => $file,
                        'statements' => $stats['applied'],
                        'skipped_dupes' => $stats['skipped'],
                    ];
                } catch (Throwable $e) {
                    $error = [
                        'file' => $file,
                        'message' => $e->getMessage(),
                        'sql_preview' => $e instanceof MigrationException ? $e->sqlPreview : null,
                        'at' => gmdate(DATE_ATOM),
                        'hint' => 'Исправьте SQL/права БД и нажмите «Повторить миграции» в админке.',
                    ];
                    $this->writeLastError($error);
                    $this->block();
                    break;
                }
            }
            if (!$error) {
                $this->clearLastError();
                $this->unblock();
            }
        } finally {
            $this->releaseLock($lock);
        }

        return [
            'ok' => $error === null,
            'applied' => $applied,
            'error' => $error,
        ];
    }

    /** @return list<string> */
    public function pendingFiles(): array
    {
        $applied = array_flip($this->appliedFiles());
        $out = [];
        foreach (self::FILES as $file) {
            $path = rtrim($this->migrationsDir, '/\\') . DIRECTORY_SEPARATOR . $file;
            if (!is_file($path)) {
                continue;
            }
            if (!isset($applied[$file])) {
                $out[] = $file;
            }
        }
        foreach ($this->pluginMigrationFiles() as $id => $path) {
            if (!isset($applied[$id]) && is_file($path)) {
                $out[] = $id;
            }
        }
        return $out;
    }

    /**
     * Discover plugin SQL migrations under Modules/{Name}/migrations/*.sql.
     * IDs are namespaced as "plugin:{module}:{filename}" to avoid collisions
     * with core migrations and across plugins.
     *
     * @return array<string,string> id => absolute path
     */
    private function pluginMigrationFiles(): array
    {
        if ($this->modulesDir === null || !is_dir($this->modulesDir)) {
            return [];
        }
        $out = [];
        $dirs = glob($this->modulesDir . '/*', GLOB_ONLYDIR) ?: [];
        foreach ($dirs as $modDir) {
            $modName = basename($modDir);
            $migDir = $modDir . DIRECTORY_SEPARATOR . 'migrations';
            if (!is_dir($migDir)) {
                continue;
            }
            $files = glob($migDir . '/*.sql') ?: [];
            foreach ($files as $f) {
                $id = "plugin:{$modName}:" . basename($f);
                $out[$id] = $f;
            }
        }
        return $out;
    }

    /** @return list<string> */
    public function appliedFiles(): array
    {
        try {
            $rows = $this->db->all('SELECT id FROM `_migrations` ORDER BY applied_at, id');
            return array_map(fn($r) => (string) $r['id'], $rows);
        } catch (Throwable) {
            return [];
        }
    }

    private function ensureMetaTables(): void
    {
        $pdo = $this->pdo();
        // Meta tables are driver-agnostic via the transpiler.
        $stmts = [
            'CREATE TABLE IF NOT EXISTS `_migrations` (
              `id` VARCHAR(120) NOT NULL PRIMARY KEY,
              `applied_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4',
            'CREATE TABLE IF NOT EXISTS `_migration_state` (
              `k` VARCHAR(60) NOT NULL PRIMARY KEY,
              `v` LONGTEXT NULL,
              `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4',
        ];
        foreach ($stmts as $stmt) {
            foreach ($this->transpiler->transpile($stmt) as $out) {
                try { $pdo->exec($out); } catch (Throwable) { /* already exists */ }
            }
        }
        foreach ($this->transpiler->drainTriggers() as $tr) {
            try { $pdo->exec($tr); } catch (Throwable) {}
        }
    }

    private function markApplied(string $file): void
    {
        $this->db->run('INSERT INTO `_migrations` (id) VALUES (?)', [$file]);
    }

    private function runSqlFile(string $file): array
    {
        $applied = 0;
        $skipped = 0;
        $statements = $this->splitSql((string) file_get_contents($file));
        $pdo = $this->pdo();
        $this->transpiler->reset();

        foreach ($statements as $statement) {
            // Transpile (may yield 0..N driver-specific statements).
            $outStmts = $this->transpiler->transpile($statement);
            foreach ($outStmts as $out) {
                try {
                    $pdo->exec($out);
                    $applied++;
                } catch (Throwable $e) {
                    if ($this->isIgnorableDuplicate($e->getMessage())) {
                        $skipped++;
                        continue;
                    }
                    $preview = preg_replace('/\s+/', ' ', $out) ?? $out;
                    $preview = substr($preview, 0, 240);
                    throw new MigrationException(
                        basename($file) . ": {$e->getMessage()}",
                        $preview,
                        0,
                        $e
                    );
                }
            }
        }

        // Apply any accumulated triggers (sqlite/pgsql updated_at).
        foreach ($this->transpiler->drainTriggers() as $tr) {
            try { $pdo->exec($tr); $applied++; } catch (Throwable $e) {
                if ($this->isIgnorableDuplicate($e->getMessage())) { $skipped++; continue; }
                throw new MigrationException(basename($file) . ": {$e->getMessage()}", $tr, 0, $e);
            }
        }

        return ['applied' => $applied, 'skipped' => $skipped];
    }

    private function isIgnorableDuplicate(string $msg): bool
    {
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
            // sqlite/pg duplicate index/column phrasing
            || str_contains($m, 'sqlite_constraint')
            || str_contains($m, 'unique constraint failed');
    }

    /** @return list<string> */
    private function splitSql(string $sql): array
    {
        // Editors/Windows sometimes save SQL with UTF-8 BOM; MySQL rejects it as syntax.
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
    }

    private function pdo(): PDO
    {
        // Database wraps PDO; expose via reflection-free helper if available
        if (method_exists($this->db, 'pdo')) {
            /** @var PDO $pdo */
            $pdo = $this->db->pdo();
            return $pdo;
        }
        // Fallback: raw connection from config is not available — use a query that works
        // Most installs have Database::$pdo public or getPdo
        $ref = new \ReflectionClass($this->db);
        foreach (['pdo', 'connection', 'conn'] as $prop) {
            if ($ref->hasProperty($prop)) {
                $p = $ref->getProperty($prop);
                $p->setAccessible(true);
                $val = $p->getValue($this->db);
                if ($val instanceof PDO) {
                    return $val;
                }
            }
        }
        throw new \RuntimeException('Cannot access PDO from Database');
    }

    private function readLastError(): ?array
    {
        try {
            $row = $this->db->one("SELECT v FROM `_migration_state` WHERE k='last_error'");
            if (!$row || empty($row['v'])) {
                return null;
            }
            $decoded = json_decode((string) $row['v'], true);
            return is_array($decoded) ? $decoded : ['message' => (string) $row['v']];
        } catch (Throwable) {
            return null;
        }
    }

    private function writeLastError(array $error): void
    {
        $json = json_encode($error, JSON_UNESCAPED_UNICODE);
        try {
            $this->db->upsert('_migration_state', ['k' => 'last_error', 'v' => $json], ['k'], ['v']);
        } catch (Throwable $e) {
            // Never let diagnostics persistence mask the original migration failure.
            @error_log('MigrationService::writeLastError failed: ' . $e->getMessage());
        }
        @file_put_contents(
            rtrim($this->storageDir, '/\\') . '/logs/migration_error.json',
            $json . "\n"
        );
    }

    private function clearLastError(): void
    {
        try {
            $this->db->run("DELETE FROM `_migration_state` WHERE k='last_error'");
        } catch (Throwable) {
        }
        $path = rtrim($this->storageDir, '/\\') . '/logs/migration_error.json';
        if (is_file($path)) {
            @unlink($path);
        }
    }

    private function isBlocked(): bool
    {
        try {
            $row = $this->db->one("SELECT v FROM `_migration_state` WHERE k='blocked'");
            return ($row['v'] ?? '') === '1';
        } catch (Throwable) {
            return false;
        }
    }

    private function block(): void
    {
        try {
            $this->db->upsert('_migration_state', ['k' => 'blocked', 'v' => '1'], ['k'], ['v']);
        } catch (Throwable $e) {
            @error_log('MigrationService::block failed: ' . $e->getMessage());
        }
    }

    private function unblock(): void
    {
        try {
            $this->db->run("DELETE FROM `_migration_state` WHERE k='blocked'");
        } catch (Throwable) {
        }
    }

    /** @return resource|false */
    private function acquireLock()
    {
        $dir = rtrim($this->storageDir, '/\\') . '/logs';
        if (!is_dir($dir)) {
            @mkdir($dir, 0775, true);
        }
        $path = $dir . '/migrate.lock';
        $fh = @fopen($path, 'c+');
        if (!$fh) {
            return false;
        }
        if (!flock($fh, LOCK_EX | LOCK_NB)) {
            fclose($fh);
            return false;
        }
        return $fh;
    }

    /** @param resource|false $fh */
    private function releaseLock($fh): void
    {
        if (is_resource($fh)) {
            flock($fh, LOCK_UN);
            fclose($fh);
        }
    }
}
