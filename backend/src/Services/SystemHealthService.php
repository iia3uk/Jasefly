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

        $appUrl = rtrim((string) ($this->app['url'] ?? $this->app['app_url'] ?? ''), '/') ?: 'https://YOUR_DOMAIN';
        $runtime = (string) ($this->app['runtime'] ?? 'php-shared');
        $siteTokenPath = str_contains($runtime, 'node')
            ? 'runtime env / deploy/docker/.env → MCP_API_TOKEN'
            : 'api/config/.env → MCP_API_TOKEN';

        $repoHint = 'F:/JASEFLY_CMS';
        $cursorSnippet = json_encode([
            'mcpServers' => [
                'jasefly-cms' => [
                    'command' => 'node',
                    'args' => [$repoHint . '/mcp-cms/src/index.js'],
                    'env' => ['CMS_REPO_ROOT' => $repoHint],
                ],
            ],
        ], JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT);

        return [
            'configured' => $configured,
            'token_hint' => $hint,
            'auth_header' => 'Authorization: Bearer <MCP_API_TOKEN>',
            'docs_hint' => 'Один MCP-процесс → много сайтов. Токен этого сайта: '
                . $siteTokenPath
                . '. В mcp-cms/.env тот же секрет как CMS_SITE_{ID}_TOKEN (или legacy CMS_MCP_TOKEN).',
            'app_url' => $appUrl,
            'runtime' => $runtime,
            'site_token_path' => $siteTokenPath,
            'agent_env_keys' => [
                'multi' => 'CMS_SITES + CMS_SITE_{ID}_URL + CMS_SITE_{ID}_TOKEN',
                'legacy' => 'CMS_URL + CMS_MCP_TOKEN',
                'list_tool' => 'cms_sites',
                'site_param' => 'site',
            ],
            'multi_site_hint' => 'SoT хостов — только mcp-cms/.env (не sites.js). При ≥2 сайтах в tools передавайте site=id|alias|domain.',
            'cursor_snippet' => is_string($cursorSnippet) ? $cursorSnippet : '',
            'docs_url' => 'docs/mcp-multi-site.md',
            'local_example_env' => implode("\n", [
                'CMS_SITES=jasefly,iia3uk',
                'CMS_SITE_JASEFLY_URL=https://jasefly.com',
                'CMS_SITE_JASEFLY_TOKEN=<MCP_API_TOKEN сайта>',
                'CMS_SITE_JASEFLY_ALIASES=jasefly.com,www.jasefly.com',
                'CMS_SITE_IIA3UK_URL=https://iia3uk.ru',
                'CMS_SITE_IIA3UK_TOKEN=<MCP_API_TOKEN сайта>',
            ]),
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
