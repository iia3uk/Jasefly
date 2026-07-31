<?php
declare(strict_types=1);

namespace App\Services\Modules;

use App\Core\Modules\ModuleDependencyResolver;
use App\Core\Modules\ModuleManifest;
use App\Platform\Compatibility\CompatibilityLayer;

/**
 * Extensible quarantine criteria beyond Throwable:
 * SDK, dependencies, bootstrap time, memory headroom.
 * Route conflicts are enforced in Router; migrations at install/update.
 */
final class ModuleQuarantinePolicy
{
    /**
     * @param array<string, string>|null $installedMapOverride slug => version (tests / dry-run)
     */
    public function __construct(
        private array $app,
        private ?ModuleRegistryRepository $registry = null,
        private ModuleDependencyResolver $deps = new ModuleDependencyResolver(),
        private ?array $installedMapOverride = null,
    ) {}

    /** @return array{bootstrap_timeout_sec:float, memory_delta_bytes:int, memory_headroom_bytes:int} */
    public function limits(): array
    {
        $cfg = $this->app['module_quarantine'] ?? [];
        if (!is_array($cfg)) {
            $cfg = [];
        }
        return [
            'bootstrap_timeout_sec' => max(0.5, (float) ($cfg['bootstrap_timeout_sec'] ?? 5.0)),
            'memory_delta_bytes' => max(8 * 1024 * 1024, (int) ($cfg['memory_delta_bytes'] ?? 64 * 1024 * 1024)),
            'memory_headroom_bytes' => max(1024 * 1024, (int) ($cfg['memory_headroom_bytes'] ?? 8 * 1024 * 1024)),
        ];
    }

    /**
     * Pre-load gates (cheap, no require of entrypoint).
     *
     * @throws ModuleQuarantineViolation
     */
    public function assertPreload(ModuleManifest $manifest, string $slug): void
    {
        if ($manifest->slug() === '' || $manifest->slug() !== $slug) {
            throw new ModuleQuarantineViolation(
                ModuleQuarantineReason::INVALID_MANIFEST,
                'Manifest slug mismatch or empty',
                'preload',
            );
        }

        if ($manifest->apiVersion() !== ModuleManifest::API_VERSION) {
            throw new ModuleQuarantineViolation(
                ModuleQuarantineReason::SDK_INCOMPATIBLE,
                'Incompatible module api_version=' . $manifest->apiVersion()
                    . ' (platform expects ' . ModuleManifest::API_VERSION . ')',
                'preload',
            );
        }

        if (class_exists(CompatibilityLayer::class)) {
            $sdkCheck = CompatibilityLayer::checkSdkVersion($manifest->sdkVersion());
            $errors = $sdkCheck['errors'] ?? [];
            if (is_array($errors) && $errors !== []) {
                throw new ModuleQuarantineViolation(
                    ModuleQuarantineReason::SDK_INCOMPATIBLE,
                    'Incompatible Platform SDK: ' . implode('; ', array_map('strval', $errors)),
                    'preload',
                );
            }
        }

        $cmsVersion = (string) ($this->app['version'] ?? '1.0.0');
        if (!$this->deps->satisfies($cmsVersion, '>=' . $manifest->minJaseflyVersion())) {
            throw new ModuleQuarantineViolation(
                ModuleQuarantineReason::SDK_INCOMPATIBLE,
                'CMS version ' . $cmsVersion . ' below module min_version ' . $manifest->minJaseflyVersion(),
                'preload',
            );
        }
        $max = $manifest->maxJaseflyVersion();
        if ($max !== null && !$this->deps->satisfies($cmsVersion, '<=' . $max)) {
            throw new ModuleQuarantineViolation(
                ModuleQuarantineReason::SDK_INCOMPATIBLE,
                'CMS version ' . $cmsVersion . ' above module max_version ' . $max,
                'preload',
            );
        }

        if (version_compare(PHP_VERSION, $manifest->minPhpVersion(), '<')) {
            throw new ModuleQuarantineViolation(
                ModuleQuarantineReason::SDK_INCOMPATIBLE,
                'PHP ' . PHP_VERSION . ' below module min ' . $manifest->minPhpVersion(),
                'preload',
            );
        }

        $installedMap = $this->installedVersionMap();
        // Core "system" is always present.
        $installedMap['system'] = $installedMap['system'] ?? $cmsVersion;

        $plan = $this->deps->plan($manifest, $installedMap);
        if (!$plan['ok']) {
            $bits = [];
            foreach ($plan['missing'] as $m) {
                $bits[] = 'missing ' . $m['slug'] . ' (' . $m['constraint'] . ')';
            }
            foreach ($plan['conflicts'] as $c) {
                $bits[] = 'conflicts ' . $c['slug'] . ' (have ' . $c['installed'] . ')';
            }
            throw new ModuleQuarantineViolation(
                ModuleQuarantineReason::MISSING_DEPENDENCY,
                'Dependency check failed: ' . implode('; ', $bits),
                'preload',
            );
        }
    }

    /**
     * Post-load budget: wall time + memory delta / headroom to ini limit.
     *
     * @throws ModuleQuarantineViolation
     */
    public function assertBudget(float $startedAt, int $memBefore, string $slug): void
    {
        $limits = $this->limits();
        $elapsed = microtime(true) - $startedAt;
        if ($elapsed > $limits['bootstrap_timeout_sec']) {
            throw new ModuleQuarantineViolation(
                ModuleQuarantineReason::BOOTSTRAP_TIMEOUT,
                sprintf(
                    'Module bootstrap exceeded %.2fs (limit %.2fs) for %s',
                    $elapsed,
                    $limits['bootstrap_timeout_sec'],
                    $slug,
                ),
                'budget',
            );
        }

        $memAfter = memory_get_usage(true);
        $delta = max(0, $memAfter - $memBefore);
        if ($delta > $limits['memory_delta_bytes']) {
            throw new ModuleQuarantineViolation(
                ModuleQuarantineReason::MEMORY_LIMIT,
                sprintf(
                    'Module load memory delta %d MB exceeds limit %d MB for %s',
                    (int) round($delta / 1048576),
                    (int) round($limits['memory_delta_bytes'] / 1048576),
                    $slug,
                ),
                'budget',
            );
        }

        $ini = ini_get('memory_limit');
        $limitBytes = $this->parseIniBytes(is_string($ini) ? $ini : '-1');
        if ($limitBytes > 0) {
            $free = $limitBytes - $memAfter;
            if ($free < $limits['memory_headroom_bytes']) {
                throw new ModuleQuarantineViolation(
                    ModuleQuarantineReason::MEMORY_LIMIT,
                    sprintf(
                        'Memory headroom %d KB below %d KB after loading %s',
                        (int) round(max(0, $free) / 1024),
                        (int) round($limits['memory_headroom_bytes'] / 1024),
                        $slug,
                    ),
                    'budget',
                );
            }
        }
    }

    /** @return array<string, string> slug => version */
    private function installedVersionMap(): array
    {
        if ($this->installedMapOverride !== null) {
            return $this->installedMapOverride;
        }
        $map = [];
        if ($this->registry === null) {
            return $map;
        }
        foreach ($this->registry->listAll() as $row) {
            $slug = (string) ($row['slug'] ?? '');
            $status = (string) ($row['status'] ?? '');
            if ($slug === '' || $status !== 'enabled') {
                continue;
            }
            $map[$slug] = (string) ($row['installed_version'] ?? '0.0.0');
        }
        return $map;
    }

    private function parseIniBytes(string $value): int
    {
        $value = trim($value);
        if ($value === '' || $value === '-1') {
            return -1;
        }
        if (!preg_match('/^(\d+)([KMG])?$/i', $value, $m)) {
            return (int) $value;
        }
        $n = (int) $m[1];
        return match (strtoupper($m[2] ?? '')) {
            'G' => $n * 1073741824,
            'M' => $n * 1048576,
            'K' => $n * 1024,
            default => $n,
        };
    }
}
