<?php
declare(strict_types=1);

namespace App\Services\Modules;

use App\Core\Db\SqlTranspiler;
use App\Core\Modules\ModuleInstallContext;
use App\Database;
use App\MigrationException;
use PDO;
use Throwable;

/**
 * Applies per-module SQL migrations tracked in module_migrations.
 */
final class ModuleMigrationService
{
    private SqlTranspiler $transpiler;

    public function __construct(private Database $db)
    {
        $this->transpiler = new SqlTranspiler($db->driver());
    }

    /**
     * @return array{pending:list<string>, drift:list<string>}
     */
    public function listPending(string $slug, string $migrationsDir): array
    {
        $pending = [];
        $drift = [];
        $applied = $this->appliedMap($slug);

        if (!is_dir($migrationsDir)) {
            return ['pending' => [], 'drift' => []];
        }

        $files = glob(rtrim($migrationsDir, '/\\') . '/*.sql') ?: [];
        sort($files);

        foreach ($files as $path) {
            $name = basename($path);
            $checksum = $this->fileChecksum($path);
            if (!isset($applied[$name])) {
                $pending[] = $name;
                continue;
            }
            if (!hash_equals($applied[$name], $checksum)) {
                $drift[] = $name;
            }
        }

        return ['pending' => $pending, 'drift' => $drift];
    }

    /**
     * @return array{applied:list<string>, error:?array<string,mixed>}
     */
    public function applyPending(string $slug, string $migrationsDir, string $version): array
    {
        $plan = $this->listPending($slug, $migrationsDir);
        if ($plan['drift'] !== []) {
            return [
                'applied' => [],
                'error' => [
                    'message' => 'Migration checksum drift: ' . implode(', ', $plan['drift']),
                    'drift' => $plan['drift'],
                ],
            ];
        }

        $applied = [];
        $batch = $this->nextBatch($slug);

        foreach ($plan['pending'] as $file) {
            $path = rtrim($migrationsDir, '/\\') . DIRECTORY_SEPARATOR . $file;
            if (!is_file($path)) {
                continue;
            }
            try {
                $this->runSqlFile($path);
                $checksum = $this->fileChecksum($path);
                $this->recordApplied($slug, $file, $checksum, $version, $batch);
                $this->mirrorCoreMigration($slug, $file);
                $applied[] = $file;
            } catch (Throwable $e) {
                return [
                    'applied' => $applied,
                    'error' => [
                        'file' => $file,
                        'message' => $e->getMessage(),
                        'sql_preview' => $e instanceof MigrationException ? $e->sqlPreview : null,
                    ],
                ];
            }
        }

        return ['applied' => $applied, 'error' => null];
    }

    /**
     * @return array{applied:list<string>, error:?array<string,mixed>}
     */
    public function applyUninstall(string $slug, string $uninstallDir): array
    {
        if (!is_dir($uninstallDir)) {
            return ['applied' => [], 'error' => null];
        }

        $files = glob(rtrim($uninstallDir, '/\\') . '/*.sql') ?: [];
        rsort($files);
        $applied = [];

        foreach ($files as $path) {
            $file = basename($path);
            try {
                $this->runSqlFile($path);
                $applied[] = $file;
            } catch (Throwable $e) {
                return [
                    'applied' => $applied,
                    'error' => [
                        'file' => $file,
                        'message' => $e->getMessage(),
                        'sql_preview' => $e instanceof MigrationException ? $e->sqlPreview : null,
                    ],
                ];
            }
        }

        try {
            $this->db->run('DELETE FROM module_migrations WHERE module_slug=?', [$slug]);
        } catch (Throwable) {
        }

        return ['applied' => $applied, 'error' => null];
    }

    /** @return array<string, string> migration => checksum */
    private function appliedMap(string $slug): array
    {
        try {
            $rows = $this->db->all(
                'SELECT migration, checksum FROM module_migrations WHERE module_slug=?',
                [$slug]
            );
            $out = [];
            foreach ($rows as $row) {
                $out[(string) $row['migration']] = (string) $row['checksum'];
            }
            return $out;
        } catch (Throwable) {
            return [];
        }
    }

    private function nextBatch(string $slug): int
    {
        try {
            $row = $this->db->one(
                'SELECT MAX(batch) AS mx FROM module_migrations WHERE module_slug=?',
                [$slug]
            );
            return (int) ($row['mx'] ?? 0) + 1;
        } catch (Throwable) {
            return 1;
        }
    }

    private function recordApplied(string $slug, string $migration, string $checksum, string $version, int $batch): void
    {
        $this->db->upsert(
            'module_migrations',
            [
                'module_slug' => $slug,
                'migration' => $migration,
                'checksum' => $checksum,
                'module_version' => $version,
                'batch' => $batch,
                'applied_at' => gmdate('Y-m-d H:i:s'),
            ],
            ['module_slug', 'migration'],
            ['checksum', 'module_version', 'batch', 'applied_at']
        );
    }

    private function mirrorCoreMigration(string $slug, string $file): void
    {
        if (!$this->tableExists('_migrations')) {
            return;
        }
        $id = 'package:' . $slug . ':' . $file;
        try {
            $existing = $this->db->one('SELECT id FROM `_migrations` WHERE id=? LIMIT 1', [$id]);
            if ($existing === null) {
                $this->db->run('INSERT INTO `_migrations` (id) VALUES (?)', [$id]);
            }
        } catch (Throwable) {
        }
    }

    private function tableExists(string $table): bool
    {
        try {
            return match ($this->db->driver()) {
                'sqlite' => $this->db->one("SELECT name FROM sqlite_master WHERE type='table' AND name=?", [$table]) !== null,
                'pgsql' => $this->db->one('SELECT tablename FROM pg_tables WHERE schemaname=current_schema() AND tablename=?', [$table]) !== null,
                default => $this->db->one('SHOW TABLES LIKE ?', [$table]) !== null,
            };
        } catch (Throwable) {
            return false;
        }
    }

    private function fileChecksum(string $path): string
    {
        return 'sha256:' . hash_file('sha256', $path);
    }

    /** @return array{applied:int, skipped:int} */
    private function runSqlFile(string $file): array
    {
        $applied = 0;
        $skipped = 0;
        $statements = $this->splitSql((string) file_get_contents($file));
        $pdo = $this->pdo();
        $this->transpiler->reset();

        foreach ($statements as $statement) {
            foreach ($this->transpiler->transpile($statement) as $out) {
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

        foreach ($this->transpiler->drainTriggers() as $tr) {
            try {
                $pdo->exec($tr);
                $applied++;
            } catch (Throwable $e) {
                if ($this->isIgnorableDuplicate($e->getMessage())) {
                    $skipped++;
                    continue;
                }
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
            || str_contains($m, 'sqlite_constraint')
            || str_contains($m, 'unique constraint failed');
    }

    /** @return list<string> */
    private function splitSql(string $sql): array
    {
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
        return $this->db->pdo();
    }
}
