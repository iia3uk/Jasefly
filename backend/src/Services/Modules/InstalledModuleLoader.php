<?php
declare(strict_types=1);

namespace App\Services\Modules;

use App\Core\EventDispatcher;
use App\Core\ModuleRegistry;
use App\Core\Modules\InstallableModuleInterface;
use App\Core\Modules\ModuleContext;
use App\Core\Modules\ModuleManifest;
use App\Core\Modules\ModulePackagePaths;
use App\Core\Modules\PackageModuleAdapter;
use App\Database;
use App\Router;

/**
 * Bootstraps enabled package modules into ModuleRegistry at runtime.
 */
final class InstalledModuleLoader
{
    public function __construct(
        private ModuleRegistryRepository $registry,
        private ModulePackagePaths $paths,
        private ModuleSafeMode $safeMode,
        private Database $db,
        private array $app,
    ) {}

    public function loadEnabled(ModuleRegistry $registry, ?Router $router = null): void
    {
        foreach ($this->registry->listAll() as $row) {
            $slug = (string) ($row['slug'] ?? '');
            $status = (string) ($row['status'] ?? '');
            $source = (string) ($row['source'] ?? 'package');
            if ($slug === '' || $status !== 'enabled' || $source === 'bundled') {
                continue;
            }
            if ($this->safeMode->isSkipped($slug)) {
                continue;
            }
            try {
                $this->loadOne($registry, $row, $router);
                $this->safeMode->clear($slug);
            } catch (\Throwable $e) {
                $msg = $e->getMessage();
                @error_log('InstalledModuleLoader failed ' . $slug . ': ' . $msg);
                $this->registry->setStatus($slug, 'failed', $msg, 'failed');
                $this->safeMode->markFailed($slug, $msg);
                $registry->recordLoadFailure($slug, 'package_load', $msg);
            }
        }
    }

    /** @param array<string, mixed> $row */
    private function loadOne(ModuleRegistry $registry, array $row, ?Router $router): void
    {
        $slug = (string) $row['slug'];
        $manifest = $this->parseManifest($row);
        if ($manifest === null) {
            throw new \RuntimeException('Invalid manifest for ' . $slug);
        }

        $moduleRoot = $this->paths->moduleRoot($slug);
        if (!is_dir($moduleRoot)) {
            throw new \RuntimeException('Module directory missing');
        }

        $entryRel = $this->resolveInstalledEntryRelative($moduleRoot, $manifest);
        if ($entryRel === null) {
            $wanted = ltrim(str_replace('\\', '/', $manifest->backendEntrypoint()), '/');
            throw new \RuntimeException('Entrypoint missing: ' . $wanted);
        }
        $entryPath = $moduleRoot . DIRECTORY_SEPARATOR . str_replace('/', DIRECTORY_SEPARATOR, $entryRel);
        if (!is_file($entryPath)) {
            throw new \RuntimeException('Entrypoint missing: ' . $entryRel);
        }
        $this->paths->assertContained($moduleRoot, $entryPath);

        $before = get_declared_classes();
        require_once $entryPath;
        $newClasses = array_diff(get_declared_classes(), $before);
        $expectedNs = 'App\\PackageModules\\' . $manifest->studlySlug() . '\\';

        $inner = null;
        foreach ($newClasses as $class) {
            if (!str_starts_with($class, $expectedNs)) {
                continue;
            }
            if (is_subclass_of($class, InstallableModuleInterface::class) || in_array(InstallableModuleInterface::class, class_implements($class) ?: [], true)) {
                $inner = new $class();
                break;
            }
        }

        if (!$inner instanceof InstallableModuleInterface) {
            throw new \RuntimeException('Entrypoint must implement InstallableModuleInterface under App\\PackageModules\\');
        }

        if (method_exists($inner, 'setPackageManifest')) {
            $inner->setPackageManifest($manifest);
        }

        $adapter = new PackageModuleAdapter($inner, $manifest);
        $registry->register($adapter);

        // Optional early register() when caller already has a Router (CLI tools).
        // Normal HTTP boot uses ModuleRegistry::boot + registerRoutes only.
        if ($router !== null) {
            $storageRoot = $this->paths->moduleStorage($slug);
            $context = new ModuleContext(
                $this->db,
                $this->app,
                $router,
                (string) (($this->app['api']['versions'][0] ?? '/api/v1')),
                $registry->events(),
                $registry,
                $manifest,
                $moduleRoot,
                $storageRoot,
            );
            $inner->register($context);
        }
    }

    /** @param array<string, mixed> $row */
    private function parseManifest(array $row): ?ModuleManifest
    {
        $raw = $row['manifest_json'] ?? null;
        if (!is_string($raw) || $raw === '') {
            return null;
        }
        $data = json_decode($raw, true);
        if (!is_array($data)) {
            return null;
        }
        return ModuleManifest::fromArray($data);
    }

    private function resolveInstalledEntryRelative(string $moduleRoot, ModuleManifest $manifest): ?string
    {
        $ep = ltrim(str_replace('\\', '/', $manifest->backendEntrypoint()), '/');
        if ($ep === '') {
            return null;
        }
        $candidates = [$ep];
        if (str_starts_with($ep, 'backend/')) {
            $candidates[] = substr($ep, strlen('backend/'));
        } else {
            $candidates[] = 'backend/' . $ep;
        }
        foreach ($candidates as $rel) {
            $abs = $moduleRoot . DIRECTORY_SEPARATOR . str_replace('/', DIRECTORY_SEPARATOR, $rel);
            if (is_file($abs)) {
                return $rel;
            }
        }
        return null;
    }
}
