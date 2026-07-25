<?php
declare(strict_types=1);

namespace App\Services\Modules;

use App\Core\Modules\ModuleDependencyResolver;
use App\Core\Modules\ModuleManifest;
use App\Core\Modules\ModulePackagePaths;

/**
 * Post-install integrity and compatibility checks.
 */
final class ModuleHealthService
{
    public function __construct(
        private ModuleRegistryRepository $registry,
        private ModulePackagePaths $paths,
        private ModuleMigrationService $migrations,
        private array $app = [],
        private ModulePackageValidator $validator = new ModulePackageValidator(),
        private ModuleDependencyResolver $deps = new ModuleDependencyResolver(),
    ) {}

    /**
     * @return array{status:string, issues:list<string>, warnings:list<string>}
     */
    public function check(string $slug): array
    {
        $issues = [];
        $warnings = [];

        $row = $this->registry->getBySlug($slug);
        if ($row === null) {
            return ['status' => 'failed', 'issues' => ['Module not registered'], 'warnings' => []];
        }

        $manifest = $this->parseManifest($row);
        if ($manifest === null) {
            $issues[] = 'manifest_json missing or invalid';
            $this->registry->setStatus($slug, (string) ($row['status'] ?? 'installed'), null, 'failed');
            return ['status' => 'failed', 'issues' => $issues, 'warnings' => $warnings];
        }

        $cmsVersion = (string) ($this->app['version'] ?? '1.0.0');
        if ($manifest->apiVersion() !== ModuleManifest::API_VERSION) {
            $issues[] = 'Incompatible module api_version';
        }
        if (!$this->deps->satisfies($cmsVersion, '>=' . $manifest->minJaseflyVersion())) {
            $issues[] = 'CMS version below minimum';
        }
        $max = $manifest->maxJaseflyVersion();
        if ($max !== null && !$this->deps->satisfies($cmsVersion, '<=' . $max)) {
            $issues[] = 'CMS version above maximum';
        }

        $installedMap = $this->installedVersionMap();
        $depPlan = $this->deps->plan($manifest, $installedMap);
        if (!$depPlan['ok']) {
            foreach ($depPlan['missing'] as $m) {
                $issues[] = 'Missing dependency: ' . $m['slug'];
            }
            foreach ($depPlan['conflicts'] as $c) {
                $issues[] = 'Conflicts with: ' . $c['slug'];
            }
        }
        foreach ($depPlan['optional'] as $o) {
            if ($o['installed'] === null) {
                $warnings[] = 'Optional dependency missing: ' . $o['slug'];
            }
        }

        $moduleRoot = $this->paths->moduleRoot($slug);
        $entryRel = $this->installedEntryRelative($manifest);
        $entryPath = $moduleRoot . '/' . $entryRel;
        if (!is_file($entryPath)) {
            $issues[] = 'Backend entrypoint missing';
        } else {
            try {
                $this->paths->assertContained($moduleRoot, $entryPath);
                $before = get_declared_classes();
                require_once $entryPath;
                $new = array_diff(get_declared_classes(), $before);
                if ($new === []) {
                    $issues[] = 'Entrypoint did not declare a class';
                }
            } catch (\Throwable $e) {
                $issues[] = 'Entrypoint not loadable: ' . $e->getMessage();
            }
        }

        $recorded = $this->registry->listModuleFiles($slug);
        $modified = false;
        $publicRoot = $this->paths->publicModuleRoot($slug);
        foreach ($recorded as $f) {
            $rel = (string) ($f['relative_path'] ?? '');
            $expected = (string) ($f['sha256'] ?? '');
            if (str_starts_with($rel, 'public:')) {
                $abs = $publicRoot . '/' . substr($rel, strlen('public:'));
            } else {
                $abs = $moduleRoot . '/' . str_replace('\\', '/', $rel);
            }
            if (!is_file($abs)) {
                $issues[] = 'Missing tracked file: ' . $rel;
                $modified = true;
                continue;
            }
            $actual = hash_file('sha256', $abs);
            if ($expected !== '' && !hash_equals($expected, (string) $actual)) {
                $issues[] = 'Modified file: ' . $rel;
                $modified = true;
            }
        }

        $migrationsDir = $moduleRoot . '/' . trim($manifest->migrationsPath(), '/');
        $migPlan = $this->migrations->listPending($slug, $migrationsDir);
        if ($migPlan['drift'] !== []) {
            $issues[] = 'Migration checksum drift: ' . implode(', ', $migPlan['drift']);
            $modified = true;
        }
        if ($migPlan['pending'] !== []) {
            $warnings[] = 'Pending migrations: ' . implode(', ', $migPlan['pending']);
        }

        $sig = (string) ($row['signature_status'] ?? 'unsigned');
        if ($sig === 'unsigned' || $sig === 'unknown_key') {
            $warnings[] = 'Package signature: ' . $sig;
        } elseif (in_array($sig, ['invalid', 'failed', 'mismatch'], true)) {
            $issues[] = 'Package signature invalid';
        }

        $status = 'healthy';
        if ($issues !== []) {
            $status = $this->hasIncompatibleOnly($issues) ? 'incompatible' : 'failed';
            if ($modified && $status === 'failed' && $this->onlyModifiedIssues($issues)) {
                $status = 'modified';
            }
        } elseif ($modified) {
            $status = 'modified';
        } elseif ($warnings !== []) {
            $status = 'warning';
        }

        if (in_array($status, ['failed', 'modified', 'incompatible'], true) && ($row['status'] ?? '') === 'enabled') {
            // keep enabled status but record health
        }
        $this->registry->upsert(['slug' => $slug, 'health_status' => $status]);

        return ['status' => $status, 'issues' => $issues, 'warnings' => $warnings];
    }

    /** @return array<string, string> */
    private function installedVersionMap(): array
    {
        $cmsVersion = (string) ($this->app['version'] ?? '1.0.0');
        $map = [
            'system' => $cmsVersion,
            'users' => $cmsVersion,
            'module-manager' => $cmsVersion,
        ];
        $bundledRoot = dirname(__DIR__, 2) . '/Modules';
        foreach (glob($bundledRoot . '/*', GLOB_ONLYDIR) ?: [] as $dir) {
            $folder = basename($dir);
            $map[strtolower($folder)] = $cmsVersion;
            $kebab = strtolower((string) (preg_replace('/([a-z])([A-Z])/', '$1-$2', $folder) ?? $folder));
            $map[$kebab] = $cmsVersion;
        }
        foreach ($this->registry->listAll() as $row) {
            $slug = (string) ($row['slug'] ?? '');
            if ($slug === '') {
                continue;
            }
            $st = (string) ($row['status'] ?? '');
            if (in_array($st, ['installed', 'enabled', 'disabled', 'failed'], true)) {
                $map[$slug] = (string) ($row['installed_version'] ?? '0.0.0');
            }
        }
        return $map;
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

    private function installedEntryRelative(ModuleManifest $manifest): string
    {
        $ep = str_replace('\\', '/', $manifest->backendEntrypoint());
        if (str_starts_with($ep, 'backend/')) {
            return substr($ep, strlen('backend/'));
        }
        return ltrim($ep, '/');
    }

    /** @param list<string> $issues */
    private function hasIncompatibleOnly(array $issues): bool
    {
        foreach ($issues as $i) {
            if (!str_contains($i, 'version') && !str_contains($i, 'dependency') && !str_contains($i, 'api_version')) {
                return false;
            }
        }
        return $issues !== [];
    }

    /** @param list<string> $issues */
    private function onlyModifiedIssues(array $issues): bool
    {
        foreach ($issues as $i) {
            if (!str_contains($i, 'Modified') && !str_contains($i, 'drift')) {
                return false;
            }
        }
        return true;
    }
}
