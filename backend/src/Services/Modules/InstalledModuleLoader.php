<?php
declare(strict_types=1);

namespace App\Services\Modules;

use App\Core\ModuleRegistry;
use App\Core\Modules\InstallableModuleInterface;
use App\Core\Modules\ModuleContext;
use App\Core\Modules\ModuleManifest;
use App\Core\Modules\ModulePackagePaths;
use App\Core\Modules\PackageModuleAdapter;
use App\Database;
use App\Platform\Surfaces\PackageSurfaceRegistry;
use App\Router;

/**
 * Bootstraps enabled package modules into ModuleRegistry at runtime.
 * Failures are quarantined — core boot always continues.
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
        // Ensure PackageModules\* autoload can resolve classes for this install root
        // (hosting api/modules or behavior php-storage/modules).
        \App\Bootstrap::addPackageModulesRoot($this->paths->modulesRoot());

        $quarantine = new ModuleQuarantine($this->registry, $this->safeMode, $this->db);

        foreach ($this->registry->listAll() as $row) {
            $slug = (string) ($row['slug'] ?? '');
            $status = (string) ($row['status'] ?? '');
            $source = (string) ($row['source'] ?? 'package');
            if ($slug === '' || $status !== 'enabled' || $source === 'bundled') {
                continue;
            }
            if ($this->safeMode->isSkipped($slug)) {
                // Persist quarantine status if safe-mode skipped but DB still says enabled.
                if (($row['health_status'] ?? '') !== 'quarantined') {
                    $entry = $this->safeMode->entry($slug);
                    $msg = $entry['error'] ?? 'Previously quarantined (safe-mode)';
                    try {
                        $this->registry->setStatus($slug, 'failed', (string) $msg, 'quarantined');
                    } catch (\Throwable) {
                    }
                }
                continue;
            }
            try {
                $this->loadOne($registry, $row, $router);
                $this->safeMode->clear($slug);
            } catch (\Throwable $e) {
                if ($e instanceof ModuleQuarantineViolation
                    && $e->reason === ModuleQuarantineReason::ENTRYPOINT_UNSAFE) {
                    $quarantine->isolate($slug, $e, $e->stage, $registry);
                } else {
                    $quarantine->isolate($slug, $e, 'package_load', $registry);
                }
            }
        }
    }

    /** @param array<string, mixed> $row */
    private function loadOne(
        ModuleRegistry $registry,
        array $row,
        ?Router $router,
    ): void {
        $slug = (string) $row['slug'];
        $manifest = $this->parseManifest($row);
        if ($manifest === null) {
            throw new ModuleQuarantineViolation(
                ModuleQuarantineReason::INVALID_MANIFEST,
                'Invalid manifest for ' . $slug,
                'preload',
            );
        }

        $policy = new ModuleQuarantinePolicy($this->app, $this->registry);
        $policy->assertPreload($manifest, $slug);

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

        // Preflight: incompatible method signatures cause uncatchable E_COMPILE_ERROR on require.
        try {
            $this->assertEntrypointLoadable($entryPath);
        } catch (\Throwable $e) {
            throw new ModuleQuarantineViolation(
                ModuleQuarantineReason::ENTRYPOINT_UNSAFE,
                $e->getMessage(),
                'entrypoint_preflight',
                $e,
            );
        }

        $startedAt = microtime(true);
        $memBefore = memory_get_usage(true);

        require_once $entryPath;
        $expectedNs = 'App\\PackageModules\\' . $manifest->studlySlug() . '\\';

        // Health checks (and prior boots in the same process) may already have
        // required the entrypoint — require_once is then a no-op, so do not rely
        // on array_diff(get_declared_classes()). Scan the package namespace.
        $inner = null;
        foreach (get_declared_classes() as $class) {
            if (!str_starts_with($class, $expectedNs)) {
                continue;
            }
            if (!is_subclass_of($class, InstallableModuleInterface::class)
                && !in_array(InstallableModuleInterface::class, class_implements($class) ?: [], true)) {
                continue;
            }
            // Prefer concrete *Module entry over abstract bases in the same ns.
            if (str_ends_with($class, 'Module') || $inner === null) {
                $inner = new $class();
                if (str_ends_with($class, 'Module')) {
                    break;
                }
            }
        }

        if (!$inner instanceof InstallableModuleInterface) {
            throw new \RuntimeException('Entrypoint must implement InstallableModuleInterface under App\\PackageModules\\');
        }

        if (method_exists($inner, 'setPackageManifest')) {
            $inner->setPackageManifest($manifest);
        }

        $surfaces = $manifest->surfaces();
        if ($surfaces !== []) {
            PackageSurfaceRegistry::register($slug, $surfaces);
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

        try {
            $policy->assertBudget($startedAt, $memBefore, $slug);
        } catch (ModuleQuarantineViolation $budget) {
            // Roll back registration — module must not stay hot after budget violation.
            $registry->unregister($slug);
            throw $budget;
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

    /**
     * Reject entrypoints that would fatal at compile time (uncatchable E_COMPILE_ERROR).
     * Classic footgun: redeclaring AbstractModule::settings() as private static.
     */
    private function assertEntrypointLoadable(string $entryPath): void
    {
        $src = @file_get_contents($entryPath);
        if (!is_string($src) || $src === '') {
            throw new \RuntimeException('Entrypoint unreadable');
        }
        if (preg_match('/\b(?:private|protected|public)\s+static\s+function\s+settings\s*\(/', $src)) {
            throw new \RuntimeException(
                'Entrypoint redeclares settings() as static — conflicts with AbstractModule::settings() (compile fatal). Rename the helper.'
            );
        }
        if (preg_match('/\b(?:private|protected)\s+function\s+settings\s*\(/', $src)) {
            throw new \RuntimeException(
                'Entrypoint narrows settings() visibility — conflicts with AbstractModule::settings(). Rename the helper.'
            );
        }
    }
}
