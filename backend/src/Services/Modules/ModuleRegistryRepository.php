<?php
declare(strict_types=1);

namespace App\Services\Modules;

use App\Database;

/**
 * Persistence for installed_modules, module_operations and module_files.
 */
final class ModuleRegistryRepository
{
    public function __construct(private Database $db) {}

    /** @return list<array<string, mixed>> */
    public function listAll(): array
    {
        try {
            return $this->db->all('SELECT * FROM installed_modules ORDER BY slug');
        } catch (\Throwable) {
            return [];
        }
    }

    /** @return array<string, mixed>|null */
    public function getBySlug(string $slug): ?array
    {
        try {
            return $this->db->one('SELECT * FROM installed_modules WHERE slug=? LIMIT 1', [$slug]);
        } catch (\Throwable) {
            return null;
        }
    }

    /** @param array<string, mixed> $row */
    public function upsert(array $row): void
    {
        $slug = (string) ($row['slug'] ?? '');
        if ($slug === '') {
            throw new \InvalidArgumentException('slug required');
        }
        $existing = $this->getBySlug($slug);
        if ($existing === null) {
            $cols = array_keys($row);
            $placeholders = implode(', ', array_fill(0, count($cols), '?'));
            $sql = 'INSERT INTO installed_modules (' . implode(', ', $cols) . ') VALUES (' . $placeholders . ')';
            $this->db->run($sql, array_values($row));
            return;
        }
        unset($row['slug'], $row['id'], $row['installed_at']);
        if ($row === []) {
            return;
        }
        $sets = [];
        $params = [];
        foreach ($row as $k => $v) {
            $sets[] = "`$k`=?";
            $params[] = $v;
        }
        $params[] = $slug;
        $this->db->run('UPDATE installed_modules SET ' . implode(', ', $sets) . ' WHERE slug=?', $params);
    }

    public function setStatus(string $slug, string $status, ?string $lastError = null, ?string $healthStatus = null): void
    {
        $patch = ['status' => $status];
        if ($lastError !== null) {
            $patch['last_error'] = $lastError;
        }
        if ($healthStatus !== null) {
            $patch['health_status'] = $healthStatus;
        }
        if ($status === 'enabled') {
            $patch['enabled_at'] = gmdate('Y-m-d H:i:s');
        }
        if ($status === 'disabled') {
            $patch['disabled_at'] = gmdate('Y-m-d H:i:s');
        }
        $patch['slug'] = $slug;
        $this->upsert($patch);
    }

    /**
     * @return int operation id
     */
    public function startOperation(
        string $moduleSlug,
        string $operation,
        ?string $fromVersion = null,
        ?string $toVersion = null,
        ?int $initiatedBy = null,
        ?string $packagePath = null,
    ): int {
        $this->db->run(
            'INSERT INTO module_operations (module_slug, operation, from_version, to_version, status, initiated_by, package_path, started_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            [
                $moduleSlug,
                $operation,
                $fromVersion,
                $toVersion,
                'running',
                $initiatedBy,
                $packagePath,
                gmdate('Y-m-d H:i:s'),
            ]
        );
        return $this->db->id();
    }

    public function finishOperation(
        int $operationId,
        string $status,
        ?string $error = null,
        ?string $backupPath = null,
        bool $fileRollbackAvailable = false,
        bool $dbRollbackAvailable = false,
    ): void {
        $row = $this->getOperation($operationId);
        $log = [];
        if ($row !== null && !empty($row['log_json'])) {
            $decoded = json_decode((string) $row['log_json'], true);
            if (is_array($decoded)) {
                $log = $decoded;
            }
        }
        $this->db->run(
            'UPDATE module_operations SET status=?, error=?, backup_path=?, file_rollback_available=?, db_rollback_available=?, log_json=?, finished_at=? WHERE id=?',
            [
                $status,
                $error,
                $backupPath,
                $fileRollbackAvailable ? 1 : 0,
                $dbRollbackAvailable ? 1 : 0,
                json_encode($log, JSON_UNESCAPED_UNICODE),
                gmdate('Y-m-d H:i:s'),
                $operationId,
            ]
        );
    }

    public function appendOperationLog(int $operationId, string $line): void
    {
        $row = $this->getOperation($operationId);
        if ($row === null) {
            return;
        }
        $log = [];
        if (!empty($row['log_json'])) {
            $decoded = json_decode((string) $row['log_json'], true);
            if (is_array($decoded)) {
                $log = $decoded;
            }
        }
        $msg = trim($line);
        if ($msg === '') {
            return;
        }
        $log[] = ['at' => gmdate(DATE_ATOM), 'message' => mb_substr($msg, 0, 4000)];
        $this->db->run(
            'UPDATE module_operations SET log_json=? WHERE id=?',
            [json_encode($log, JSON_UNESCAPED_UNICODE), $operationId]
        );
    }

    /** @return list<array<string, mixed>> */
    public function listOperations(?string $moduleSlug = null, int $limit = 50): array
    {
        try {
            if ($moduleSlug !== null) {
                return $this->db->all(
                    'SELECT * FROM module_operations WHERE module_slug=? ORDER BY started_at DESC, id DESC LIMIT ' . max(1, min(200, $limit)),
                    [$moduleSlug]
                );
            }
            return $this->db->all(
                'SELECT * FROM module_operations ORDER BY started_at DESC, id DESC LIMIT ' . max(1, min(200, $limit))
            );
        } catch (\Throwable) {
            return [];
        }
    }

    /** @return array<string, mixed>|null */
    public function getOperation(int $operationId): ?array
    {
        try {
            return $this->db->one('SELECT * FROM module_operations WHERE id=? LIMIT 1', [$operationId]);
        } catch (\Throwable) {
            return null;
        }
    }

    /** @return list<array<string, mixed>> */
    public function listModuleFiles(string $slug): array
    {
        try {
            return $this->db->all(
                'SELECT relative_path, sha256, size_bytes FROM module_files WHERE module_slug=? ORDER BY relative_path',
                [$slug]
            );
        } catch (\Throwable) {
            return [];
        }
    }

    public function clearModuleFiles(string $slug): void
    {
        try {
            $this->db->run('DELETE FROM module_files WHERE module_slug=?', [$slug]);
        } catch (\Throwable) {
        }
    }

    /**
     * @param list<array{relative_path:string, sha256:string, size_bytes:int}> $files
     */
    public function replaceModuleFiles(string $slug, array $files): void
    {
        $this->clearModuleFiles($slug);
        foreach ($files as $f) {
            $this->db->run(
                'INSERT INTO module_files (module_slug, relative_path, sha256, size_bytes) VALUES (?, ?, ?, ?)',
                [
                    $slug,
                    $f['relative_path'],
                    $f['sha256'],
                    (int) $f['size_bytes'],
                ]
            );
        }
    }

    /** @return list<array<string, mixed>> */
    public function listModuleMigrations(string $slug): array
    {
        try {
            return $this->db->all(
                'SELECT migration, checksum, module_version, batch, applied_at FROM module_migrations WHERE module_slug=? ORDER BY applied_at, id',
                [$slug]
            );
        } catch (\Throwable) {
            return [];
        }
    }

    public function deleteModule(string $slug): void
    {
        try {
            $this->db->run('DELETE FROM module_files WHERE module_slug=?', [$slug]);
            $this->db->run('DELETE FROM module_migrations WHERE module_slug=?', [$slug]);
            $this->db->run('DELETE FROM installed_modules WHERE slug=?', [$slug]);
        } catch (\Throwable) {
        }
    }
}
