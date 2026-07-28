<?php
declare(strict_types=1);

namespace App\Services;

use App\Database;

final class SystemHealthService
{
    public function __construct(private Database $db, private array $app) {}

    public function status(): array
    {
        $storagePath = $this->app['storage'] ?? '';
        $uploadsPath = $storagePath . '/uploads';
        $storageBytes = $this->dirSize($uploadsPath);
        $dbSize = $this->databaseSize();
        $fileCount = (int) ($this->db->one('SELECT COUNT(*) c FROM media WHERE deleted_at IS NULL')['c'] ?? 0);
        $trashCount = (int) ($this->db->one(
            "SELECT (
              (SELECT COUNT(*) FROM projects WHERE deleted_at IS NOT NULL) +
              (SELECT COUNT(*) FROM blog_posts WHERE deleted_at IS NOT NULL) +
              (SELECT COUNT(*) FROM media WHERE deleted_at IS NOT NULL) +
              (SELECT COUNT(*) FROM experience WHERE deleted_at IS NOT NULL) +
              (SELECT COUNT(*) FROM services WHERE deleted_at IS NOT NULL) +
              (SELECT COUNT(*) FROM testimonials WHERE deleted_at IS NOT NULL)
            ) c"
        )['c'] ?? 0);

        $version = $this->db->one("SELECT meta_value FROM app_meta WHERE meta_key='app_version'")['meta_value'] ?? '1.0.0';

        $driver = $this->db->driver();
        $pdoExt = match ($driver) {
            'sqlite' => 'pdo_sqlite',
            'pgsql' => 'pdo_pgsql',
            default => 'pdo_mysql',
        };

        return [
            'php_version' => PHP_VERSION,
            'db_driver' => $driver,
            'db_version' => $this->dbVersion(),
            'storage_usage_bytes' => $storageBytes,
            'storage_usage_human' => $this->humanBytes($storageBytes),
            'database_size_bytes' => $dbSize,
            'database_size_human' => $this->humanBytes($dbSize),
            'uploaded_files_count' => $fileCount,
            'trash_items_count' => $trashCount,
            'cache_status' => extension_loaded('opcache') && ini_get('opcache.enable') ? 'enabled' : 'disabled',
            'app_version' => $version,
            'api_version' => 'v1',
            'gd_enabled' => extension_loaded('gd'),
            'pdo_enabled' => extension_loaded($pdoExt),
            'mcp' => $this->mcpStatus(),
            'module_load_failures' => $this->moduleLoadFailures(),
            'module_safe_mode' => $this->moduleSafeMode(),
        ];
    }

    /**
     * Bundled modules that failed require/construct/boot (empty = healthy).
     *
     * @return list<array{module:string, stage:string, error:string}>
     */
    private function moduleLoadFailures(): array
    {
        try {
            $registry = \App\Core\Container::getInstance()->get(\App\Core\ModuleRegistry::class);
            if ($registry instanceof \App\Core\ModuleRegistry) {
                return $registry->loadFailures();
            }
        } catch (\Throwable) {
        }
        return [];
    }

    /**
     * Package modules currently in safe-mode (skipped on boot).
     *
     * @return array<string, array{error:string, at:string}>
     */
    private function moduleSafeMode(): array
    {
        try {
            $paths = \App\Core\Modules\ModulePackagePaths::fromApp($this->app);
            return (new \App\Services\Modules\ModuleSafeMode($paths))->read();
        } catch (\Throwable) {
            return [];
        }
    }

    /** MCP token status for admin UI — never returns the full secret. */
    private function mcpStatus(): array
    {
        $token = (string) ($this->app['mcp_api_token'] ?? '');
        $configured = $token !== '';
        $hint = '••••';
        if ($configured) {
            $len = strlen($token);
            $hint = $len >= 12
                ? substr($token, 0, 4) . '…' . substr($token, -4)
                : '••••';
        }

        return [
            'configured' => $configured,
            'token_hint' => $hint,
            'auth_header' => 'Authorization: Bearer <MCP_API_TOKEN>',
            'docs_hint' => 'Токен на сайте: api/config/.env → MCP_API_TOKEN (тот же секрет в mcp-cms/.env как CMS_MCP_TOKEN).',
        ];
    }

    private function dbVersion(): string
    {
        try {
            return (string) ($this->db->one('SELECT VERSION() v')['v'] ?? 'unknown');
        } catch (Throwable) {
            return 'unknown';
        }
    }

    private function databaseSize(): int
    {
        try {
            return match ($this->db->driver()) {
                'sqlite' => (int) ($this->db->one('SELECT (SELECT page_count FROM pragma_page_count()) * (SELECT page_size FROM pragma_page_size()) AS s')['s'] ?? 0),
                'pgsql' => (int) ($this->db->one('SELECT pg_database_size(current_database()) AS s')['s'] ?? 0),
                default => (int) ($this->db->one('SELECT SUM(data_length + index_length) s FROM information_schema.tables WHERE table_schema=DATABASE()')['s'] ?? 0),
            };
        } catch (Throwable) {
            return 0;
        }
    }

    private function dirSize(string $path): int
    {
        if (!is_dir($path)) {
            return 0;
        }
        $size = 0;
        $iterator = new \RecursiveIteratorIterator(new \RecursiveDirectoryIterator($path, \FilesystemIterator::SKIP_DOTS));
        foreach ($iterator as $file) {
            if ($file->isFile()) {
                $size += $file->getSize();
            }
        }
        return $size;
    }

    private function humanBytes(int $bytes): string
    {
        $units = ['B', 'KB', 'MB', 'GB'];
        $i = 0;
        $v = (float) $bytes;
        while ($v >= 1024 && $i < count($units) - 1) {
            $v /= 1024;
            $i++;
        }
        return round($v, 2) . ' ' . $units[$i];
    }
}
