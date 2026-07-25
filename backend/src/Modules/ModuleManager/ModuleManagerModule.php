<?php
declare(strict_types=1);

namespace App\Modules\ModuleManager;

use App\Core\AbstractModule;
use App\Core\Modules\ModulePackagePaths;
use App\Database;
use App\Middleware\AuthMiddleware;
use App\Middleware\PermissionMiddleware;
use App\Middleware\RateLimitMiddleware;
use App\Request;
use App\Response;
use App\Router;
use App\Services\ActivityLogService;
use App\Services\Modules\ModuleHealthService;
use App\Services\Modules\ModuleHookRunner;
use App\Services\Modules\ModuleMigrationService;
use App\Services\Modules\ModulePackageService;
use App\Services\Modules\ModuleRegistryRepository;
use App\Services\Modules\ModuleSnapshotService;
use App\Services\Modules\ModuleStagingService;
use App\Services\PermissionService;

/**
 * Bundled system module: ZIP package install/update lifecycle for api/modules/{slug}.
 */
final class ModuleManagerModule extends AbstractModule
{
    public function name(): string
    {
        return 'module-manager';
    }

    public function label(): string
    {
        return 'Модули';
    }

    public function priority(): int
    {
        return 5;
    }

    public function category(): string
    {
        return 'core';
    }

    public function adminNav(): array
    {
        return [
            [
                'group' => 'Система',
                'path' => '/admin/modules',
                'label' => 'Модули',
                'permission' => 'modules.view',
                'icon' => 'package',
            ],
        ];
    }

    public function registerRoutes(Router $router, Database $db, array $app, string $apiPrefix): void
    {
        $p = fn(string $path) => rtrim($apiPrefix, '/') . $path;
        $perms = new PermissionService($db);
        $protected = [new AuthMiddleware($app['jwt_secret']), new PermissionMiddleware($perms)];
        $uploadRate = new RateLimitMiddleware($db, 10, 60);
        $publicRate = new RateLimitMiddleware($db, 60, 60);
        $activity = new ActivityLogService($db);
        $repo = new ModuleRegistryRepository($db);
        $paths = ModulePackagePaths::fromApp($app);

        $require = static function (Request $r, string $permission) use ($perms): void {
            $perms->require($r->user ?? [], $permission);
        };

        $svc = fn() => $this->packageService($db, $app);
        $userId = static fn(Request $r): ?int => isset($r->user['sub']) ? (int) $r->user['sub'] : null;

        // Public SPA loader assets (no auth, rate-limited)
        $router->get($p('/modules/runtime-assets'), function () use ($repo, $paths) {
            Response::json(['data' => $this->runtimeManifests($repo, $paths)]);
        }, [$publicRate]);

        $router->get($p('/admin/modules'), function (Request $r) use ($repo, $require) {
            $require($r, 'modules.view');
            Response::json(['data' => $this->listModules($repo)]);
        }, $protected);

        $router->get($p('/admin/modules/runtime'), function (Request $r) use ($repo, $paths, $require) {
            $require($r, 'modules.view');
            Response::json(['data' => $this->runtimeManifests($repo, $paths)]);
        }, $protected);

        $router->post($p('/admin/modules/upload'), function (Request $r) use ($svc, $activity, $require) {
            $require($r, 'modules.upload');
            $file = $r->file('package');
            if ($file === null) {
                Response::error('Missing file field "package"', 422);
            }
            try {
                $result = $svc()->upload($file);
                $activity->log($r, 'upload', 'module_package', null, (string) ($result['package_id'] ?? ''), $result);
                Response::json(['data' => $result]);
            } catch (\Throwable $e) {
                Response::error($e->getMessage(), 422);
            }
        }, array_merge($protected, [$uploadRate]));

        $router->post($p('/admin/modules/inspect'), function (Request $r) use ($svc, $require) {
            $require($r, 'modules.upload');
            $packageId = (string) ($r->input('package_id') ?? '');
            if ($packageId === '') {
                Response::error('package_id required', 422);
            }
            try {
                Response::json(['data' => $svc()->inspect($packageId)]);
            } catch (\Throwable $e) {
                Response::error($e->getMessage(), 422);
            }
        }, $protected);

        $router->get($p('/admin/module-operations'), function (Request $r) use ($repo, $require) {
            $require($r, 'modules.view_logs');
            $slug = (string) ($r->query('slug') ?? '');
            $limit = max(1, min(200, (int) ($r->query('limit') ?? 50)));
            $rows = $repo->listOperations($slug !== '' ? $slug : null, $limit);
            Response::json(['data' => $this->decodeOperationLogs($rows)]);
        }, $protected);

        $router->get($p('/admin/module-operations/{id}'), function (Request $r, string $id) use ($repo, $require) {
            $require($r, 'modules.view_logs');
            $row = $repo->getOperation((int) $id);
            if ($row === null) {
                Response::error('Operation not found', 404);
            }
            Response::json(['data' => $this->decodeOperationLog($row)]);
        }, $protected);

        $router->get($p('/admin/modules/{slug}'), function (Request $r, string $slug) use ($repo, $require) {
            $require($r, 'modules.view');
            $row = $repo->getBySlug($slug);
            if ($row === null) {
                Response::error('Module not found', 404);
            }
            Response::json(['data' => $this->presentModule($row)]);
        }, $protected);

        $router->post($p('/admin/modules/{slug}/install'), function (Request $r, string $slug) use ($svc, $activity, $require, $userId) {
            $require($r, 'modules.install');
            $packageId = (string) ($r->input('package_id') ?? '');
            if ($packageId === '') {
                Response::error('package_id required', 422);
            }
            try {
                $result = $svc()->install($packageId, [
                    'content_mode' => (string) ($r->input('content_mode') ?? 'merge'),
                    'preserve_existing_data' => (bool) ($r->input('preserve_existing_data') ?? false),
                    'initiated_by' => $userId($r),
                ]);
                $activity->log($r, 'install', 'installed_modules', null, $slug, $result);
                Response::json(['data' => $result]);
            } catch (\Throwable $e) {
                Response::error($e->getMessage(), 422);
            }
        }, $protected);

        $router->post($p('/admin/modules/{slug}/enable'), function (Request $r, string $slug) use ($svc, $activity, $require, $userId) {
            $require($r, 'modules.enable');
            try {
                $result = $svc()->enable($slug, $userId($r));
                $activity->log($r, 'enable', 'installed_modules', null, $slug, $result);
                Response::json(['data' => $result]);
            } catch (\Throwable $e) {
                Response::error($e->getMessage(), 422);
            }
        }, $protected);

        $router->post($p('/admin/modules/{slug}/disable'), function (Request $r, string $slug) use ($svc, $activity, $require, $userId) {
            $require($r, 'modules.disable');
            try {
                $result = $svc()->disable($slug, $userId($r));
                $activity->log($r, 'disable', 'installed_modules', null, $slug, $result);
                Response::json(['data' => $result]);
            } catch (\Throwable $e) {
                Response::error($e->getMessage(), 422);
            }
        }, $protected);

        $router->post($p('/admin/modules/{slug}/update'), function (Request $r, string $slug) use ($svc, $activity, $require, $userId) {
            $require($r, 'modules.update');
            $packageId = (string) ($r->input('package_id') ?? '');
            if ($packageId === '') {
                Response::error('package_id required', 422);
            }
            try {
                $result = $svc()->update($packageId, $slug, $userId($r));
                $activity->log($r, 'update', 'installed_modules', null, $slug, $result);
                Response::json(['data' => $result]);
            } catch (\Throwable $e) {
                Response::error($e->getMessage(), 422);
            }
        }, $protected);

        $router->post($p('/admin/modules/{slug}/rollback'), function (Request $r, string $slug) use ($svc, $activity, $require, $userId) {
            $require($r, 'modules.rollback');
            try {
                $result = $svc()->rollback($slug, $userId($r));
                $activity->log($r, 'rollback', 'installed_modules', null, $slug, $result);
                Response::json(['data' => $result]);
            } catch (\Throwable $e) {
                Response::error($e->getMessage(), 422);
            }
        }, $protected);

        $router->delete($p('/admin/modules/{slug}'), function (Request $r, string $slug) use ($svc, $activity, $require, $userId) {
            $require($r, 'modules.uninstall');
            $keepData = (string) ($r->query('keep_data') ?? '1') !== '0';
            try {
                $result = $svc()->uninstall($slug, $keepData, $userId($r));
                $activity->log($r, 'uninstall', 'installed_modules', null, $slug, $result);
                Response::json(['data' => $result]);
            } catch (\Throwable $e) {
                Response::error($e->getMessage(), 422);
            }
        }, $protected);

        $router->post($p('/admin/modules/{slug}/uninstall'), function (Request $r, string $slug) use ($svc, $activity, $require, $userId) {
            $require($r, 'modules.uninstall');
            $keepData = (bool) ($r->input('keep_data') ?? true);
            try {
                $result = $svc()->uninstall($slug, $keepData, $userId($r));
                $activity->log($r, 'uninstall', 'installed_modules', null, $slug, $result);
                Response::json(['data' => $result]);
            } catch (\Throwable $e) {
                Response::error($e->getMessage(), 422);
            }
        }, $protected);

        $router->get($p('/admin/modules/{slug}/migrations'), function (Request $r, string $slug) use ($repo, $require) {
            $require($r, 'modules.view');
            $row = $repo->getBySlug($slug);
            if ($row === null) {
                Response::error('Module not found', 404);
            }
            Response::json(['data' => $repo->listModuleMigrations($slug)]);
        }, $protected);

        $router->get($p('/admin/modules/{slug}/files'), function (Request $r, string $slug) use ($repo, $require) {
            $require($r, 'modules.view_files');
            $row = $repo->getBySlug($slug);
            if ($row === null) {
                Response::error('Module not found', 404);
            }
            Response::json(['data' => $repo->listModuleFiles($slug)]);
        }, $protected);

        $router->get($p('/admin/modules/{slug}/health'), function (Request $r, string $slug) use ($db, $app, $repo, $require) {
            $require($r, 'modules.view');
            $row = $repo->getBySlug($slug);
            if ($row === null) {
                Response::error('Module not found', 404);
            }
            $healthSvc = $this->healthService($db, $app);
            Response::json(['data' => $healthSvc->check($slug)]);
        }, $protected);

        $router->post($p('/admin/modules/{slug}/health'), function (Request $r, string $slug) use ($db, $app, $repo, $activity, $require) {
            $require($r, 'modules.view');
            $row = $repo->getBySlug($slug);
            if ($row === null) {
                Response::error('Module not found', 404);
            }
            $healthSvc = $this->healthService($db, $app);
            $result = $healthSvc->check($slug);
            $activity->log($r, 'health_check', 'installed_modules', null, $slug, $result);
            Response::json(['data' => $result]);
        }, $protected);
    }

    private function packageService(Database $db, array $app): ModulePackageService
    {
        $paths = ModulePackagePaths::fromApp($app);
        $registry = new ModuleRegistryRepository($db);
        $staging = new ModuleStagingService($paths);
        $snapshots = new ModuleSnapshotService($paths, $registry);
        $migrations = new ModuleMigrationService($db);
        $hooks = new ModuleHookRunner();
        $health = new ModuleHealthService($registry, $paths, $migrations, $app);

        return new ModulePackageService(
            $db,
            $app,
            $paths,
            $registry,
            $staging,
            $snapshots,
            $migrations,
            $hooks,
            $health,
        );
    }

    private function healthService(Database $db, array $app): ModuleHealthService
    {
        $paths = ModulePackagePaths::fromApp($app);
        $registry = new ModuleRegistryRepository($db);
        $migrations = new ModuleMigrationService($db);

        return new ModuleHealthService($registry, $paths, $migrations, $app);
    }

    /** @return list<array<string, mixed>> */
    private function listModules(ModuleRegistryRepository $repo): array
    {
        $out = [];
        foreach ($repo->listAll() as $row) {
            $out[] = $this->presentModule($row);
        }
        return $out;
    }

    /** @param array<string, mixed> $row */
    private function presentModule(array $row): array
    {
        $manifest = null;
        if (!empty($row['manifest_json']) && is_string($row['manifest_json'])) {
            $decoded = json_decode($row['manifest_json'], true);
            if (is_array($decoded)) {
                $manifest = $decoded;
            }
        }
        $frontend = null;
        if (!empty($row['frontend_manifest_json']) && is_string($row['frontend_manifest_json'])) {
            $decoded = json_decode($row['frontend_manifest_json'], true);
            if (is_array($decoded)) {
                $frontend = $decoded;
            }
        }

        return [
            'slug' => $row['slug'] ?? '',
            'name' => $row['name'] ?? '',
            'installed_version' => $row['installed_version'] ?? '',
            'status' => $row['status'] ?? '',
            'source' => $row['source'] ?? '',
            'signature_status' => $row['signature_status'] ?? '',
            'health_status' => $row['health_status'] ?? '',
            'last_error' => $row['last_error'] ?? null,
            'data_retention' => $row['data_retention'] ?? '',
            'package_checksum' => $row['package_checksum'] ?? null,
            'enabled_at' => $row['enabled_at'] ?? null,
            'disabled_at' => $row['disabled_at'] ?? null,
            'installed_at' => $row['installed_at'] ?? null,
            'updated_at' => $row['updated_at'] ?? null,
            'manifest' => $manifest,
            'frontend_manifest' => $frontend,
        ];
    }

    /**
     * @return list<array<string, mixed>>
     */
    private function runtimeManifests(ModuleRegistryRepository $repo, ModulePackagePaths $paths): array
    {
        $out = [];
        foreach ($repo->listAll() as $row) {
            if (($row['status'] ?? '') !== 'enabled') {
                continue;
            }
            if (($row['source'] ?? '') === 'bundled') {
                continue;
            }
            $slug = (string) ($row['slug'] ?? '');
            if ($slug === '') {
                continue;
            }
            $frontend = null;
            if (!empty($row['frontend_manifest_json']) && is_string($row['frontend_manifest_json'])) {
                $decoded = json_decode($row['frontend_manifest_json'], true);
                if (is_array($decoded)) {
                    $frontend = $decoded;
                }
            }
            $base = '/modules/' . $slug . '/';
            $entryRel = is_array($frontend)
                ? (string) ($frontend['entry'] ?? (($frontend['assets']['js'][0] ?? null) ?: 'index.js'))
                : 'index.js';
            $entryRel = ltrim(str_replace('\\', '/', $entryRel), '/');
            $css = [];
            if (is_array($frontend)) {
                foreach (($frontend['css'] ?? ($frontend['assets']['css'] ?? [])) as $c) {
                    if (is_string($c) && $c !== '') {
                        $css[] = $base . ltrim(str_replace('\\', '/', $c), '/');
                    }
                }
            }
            $out[] = [
                'slug' => $slug,
                'name' => $row['name'] ?? $slug,
                'version' => $row['installed_version'] ?? '',
                'status' => 'enabled',
                'entry' => $base . $entryRel,
                'css' => $css,
                'integrity' => is_array($frontend) ? ($frontend['integrity'] ?? []) : [],
                'exports' => is_array($frontend) ? ($frontend['exports'] ?? []) : [],
                'frontend_manifest' => $frontend,
                'assets_base' => $base,
            ];
        }
        return $out;
    }

    /** @param list<array<string, mixed>> $rows */
    private function decodeOperationLogs(array $rows): array
    {
        return array_map(fn(array $row) => $this->decodeOperationLog($row), $rows);
    }

    /** @param array<string, mixed> $row */
    private function decodeOperationLog(array $row): array
    {
        if (!empty($row['log_json']) && is_string($row['log_json'])) {
            $decoded = json_decode($row['log_json'], true);
            $row['log'] = is_array($decoded) ? $decoded : [];
        } else {
            $row['log'] = [];
        }
        unset($row['log_json']);
        return $row;
    }
}
