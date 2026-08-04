<?php
declare(strict_types=1);

namespace App\Platform\Analysis;

use App\Core\Modules\ModuleManifest;
use App\Database;
use App\Platform\Capabilities\CapabilityRegistry;
use App\Platform\Capabilities\ServiceRegistry;
use App\Platform\Compatibility\CompatibilityLayer;
use App\Platform\Manifest\PublicApiRegistry;
use App\Platform\SdkVersion;

/**
 * SDK CLI orchestration — used by backend/bin/sdk.php.
 */
final class SdkCliService
{
    private PackageStaticAnalyzer $analyzer;
    private CompatibilityChecker $checker;
    private ApiSnapshot $apiSnapshot;

    public function __construct(
        private ?Database $db = null,
        private string $repoRoot = '',
        private string $backendRoot = '',
        ?PackageStaticAnalyzer $analyzer = null,
        ?CompatibilityChecker $checker = null,
        ?ApiSnapshot $apiSnapshot = null,
    ) {
        if ($this->repoRoot === '') {
            $this->backendRoot = dirname(__DIR__, 2);
            $this->repoRoot = dirname($this->backendRoot);
        } elseif ($this->backendRoot === '') {
            $this->backendRoot = $this->repoRoot . '/backend';
        }
        $this->analyzer = $analyzer ?? new PackageStaticAnalyzer();
        $this->checker = $checker ?? new CompatibilityChecker($this->analyzer, $this->db);
        $this->apiSnapshot = $apiSnapshot ?? new ApiSnapshot();
    }

    public function resolveModulePath(string $arg): string
    {
        if ($arg === '') {
            throw new \RuntimeException('Path or slug required');
        }
        if (is_dir($arg)) {
            return realpath($arg) ?: $arg;
        }
        foreach ([
            $this->repoRoot . '/modules-src/' . $arg,
            // CI/public reference packages (modules-src is local-only / gitignored)
            $this->repoRoot . '/backend/tests/fixtures/modules/' . $arg,
            dirname($this->repoRoot) . '/modules/' . $arg,
            $this->repoRoot . '/../modules/' . $arg,
            $this->repoRoot . '/modules/' . $arg,
        ] as $c) {
            if (is_dir($c)) {
                return realpath($c) ?: $c;
            }
        }
        throw new \RuntimeException('Module path not found: ' . $arg);
    }

    /** @return array<string, mixed> */
    public function validateSdk(string $pathOrSlug): array
    {
        return $this->verifyCompatibility($pathOrSlug);
    }

    /** @return array<string, mixed> */
    public function verifyCompatibility(string $pathOrSlug): array
    {
        $path = $this->resolveModulePath($pathOrSlug);
        return $this->checker->checkDirectory($path);
    }

    /** @return array<string, mixed> */
    public function verifyModule(string $pathOrSlug): array
    {
        $path = $this->resolveModulePath($pathOrSlug);
        $steps = [];
        $findings = [];

        $manifestStep = $this->stepManifest($path);
        $steps[] = $manifestStep;
        $findings = array_merge($findings, $manifestStep['findings'] ?? []);

        $compat = $this->checker->checkDirectory($path);
        $steps[] = [
            'name' => 'compatibility',
            'ok' => $compat['ok'],
            'score' => $compat['score'],
        ];
        $findings = array_merge($findings, $compat['findings'] ?? []);

        $static = $this->analyzer->analyzeDirectory($path);
        $steps[] = [
            'name' => 'static_analysis',
            'ok' => $static['ok'],
            'files_scanned' => $static['files_scanned'],
        ];
        $findings = array_merge($findings, $static['findings']);

        $ok = ($manifestStep['ok'] ?? false) && $static['ok'] && $compat['ok'];

        return [
            'ok' => $ok,
            'path' => $path,
            'score' => $compat['score'] ?? 0,
            'steps' => $steps,
            'findings' => $findings,
            'errors' => array_values(array_unique(array_merge(
                $manifestStep['errors'] ?? [],
                $compat['errors'] ?? [],
                $static['errors']
            ))),
            'warnings' => array_values(array_unique(array_merge(
                $compat['warnings'] ?? [],
                $static['warnings']
            ))),
        ];
    }

    /** @return array<string, mixed> */
    public function certify(string $pathOrSlug): array
    {
        $path = $this->resolveModulePath($pathOrSlug);
        $steps = [];
        $findings = [];
        $notes = [];

        $manifestStep = $this->stepManifest($path);
        $steps[] = $manifestStep;
        $findings = array_merge($findings, $manifestStep['findings'] ?? []);

        $compat = $this->checker->checkDirectory($path);
        $steps[] = ['name' => 'compatibility', 'ok' => $compat['ok'], 'score' => $compat['score']];
        $findings = array_merge($findings, $compat['findings'] ?? []);

        $static = $this->analyzer->analyzeDirectory($path);
        $staticOk = $this->staticPasses($static);
        $steps[] = ['name' => 'static_analysis', 'ok' => $staticOk, 'files_scanned' => $static['files_scanned']];
        $findings = array_merge($findings, $static['findings']);

        $lint = $this->stepPhpLint($path);
        $steps[] = $lint;
        $findings = array_merge($findings, $lint['findings'] ?? []);

        $migrations = $this->stepMigrations($path, $manifestStep['manifest'] ?? null);
        $steps[] = $migrations;
        $findings = array_merge($findings, $migrations['findings'] ?? []);

        $fe = $this->stepFrontendImports($path);
        $steps[] = $fe;
        $findings = array_merge($findings, $fe['findings'] ?? []);

        $typecheck = $this->stepOptionalTypecheck($path);
        $steps[] = $typecheck;
        if (($typecheck['skipped'] ?? false) === true) {
            $notes[] = $typecheck['note'] ?? 'Typecheck skipped';
        }

        $feBuild = $this->stepOptionalFrontendBuild($path);
        $steps[] = $feBuild;
        if (($feBuild['optional'] ?? false) === true) {
            $notes[] = $feBuild['note'] ?? 'Frontend build is optional during certify';
        }

        $notes[] = 'Run node scripts/build-module.js ' . basename($path) . ' to produce release ZIP after certify passes';

        $allOk = ($manifestStep['ok'] ?? false)
            && $compat['ok']
            && $staticOk
            && ($lint['ok'] ?? false)
            && ($migrations['ok'] ?? true)
            && ($fe['ok'] ?? true)
            && ($typecheck['ok'] ?? true);

        $score = $this->scoreFromFindings($findings, $compat['score'] ?? 100);

        return [
            'ok' => $allOk,
            'score' => $score,
            'path' => $path,
            'steps' => $steps,
            'findings' => $findings,
            'notes' => $notes,
            'errors' => $this->collectMessages($findings, ['critical', 'high']),
            'warnings' => $this->collectMessages($findings, ['medium', 'low']),
            'recommendations' => $compat['recommendations'] ?? [],
        ];
    }

    /** @return array<string, mixed> */
    public function exportSdk(): array
    {
        $reg = new PublicApiRegistry();
        $manifest = $reg->exportManifest();
        $out = $this->backendRoot . '/src/Platform/Manifest/platform.manifest.json';
        file_put_contents($out, json_encode($manifest, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE) . "\n");
        return ['ok' => true, 'path' => $out, 'manifest' => $manifest];
    }

    /** @return array<string, mixed> */
    public function apiSnapshot(): array
    {
        $path = $this->apiSnapshot->write();
        return ['ok' => true, 'path' => $path, 'snapshot' => $this->apiSnapshot->generate()];
    }

    /** @return array<string, mixed> */
    public function apiDiff(): array
    {
        $diff = $this->apiSnapshot->diff();
        return array_merge(['path' => $this->backendRoot . '/src/Platform/Manifest/api-snapshot.v1.json'], $diff);
    }

    /** @return array<string, mixed> */
    public function listCapabilities(): array
    {
        $caps = new CapabilityRegistry($this->db);
        return [
            'capabilities' => $caps->list(),
            'providers' => $caps->dump(),
        ];
    }

    /** @return array<string, mixed> */
    public function listPublicServices(): array
    {
        return [
            'services' => ServiceRegistry::catalog(),
            'ids' => array_keys(ServiceRegistry::PUBLIC_CATALOG),
        ];
    }

    /** @return array<string, mixed> */
    public function deprecations(): array
    {
        $policyPath = __DIR__ . '/sdk-policy.json';
        $raw = is_file($policyPath) ? file_get_contents($policyPath) : false;
        $policy = is_string($raw) ? json_decode($raw, true) : [];
        return [
            'sdk_version' => SdkVersion::CURRENT,
            'deprecated_apis' => is_array($policy) ? ($policy['deprecated_apis'] ?? []) : [],
        ];
    }

    /** @return array<string, mixed> */
    public function compatibilityMatrix(): array
    {
        $matrix = [];
        foreach (SdkVersion::SUPPORTED as $v) {
            $check = CompatibilityLayer::checkSdkVersion($v);
            $matrix[] = [
                'sdk_version' => $v,
                'stability' => SdkVersion::stability($v),
                'ok' => $check['ok'],
                'errors' => $check['errors'],
                'warnings' => $check['warnings'],
            ];
        }
        return [
            'current' => SdkVersion::CURRENT,
            'supported' => SdkVersion::SUPPORTED,
            'matrix' => $matrix,
        ];
    }

    /** @return array<string, mixed> */
    public function sdkReport(): array
    {
        $reg = new PublicApiRegistry();
        return [
            'current' => SdkVersion::CURRENT,
            'supported' => SdkVersion::SUPPORTED,
            'min_supported' => SdkVersion::MIN_SUPPORTED,
            'public_api' => $reg->listApis(),
            'public_services' => ServiceRegistry::catalog(),
            'api_diff' => $this->apiSnapshot->diff(),
        ];
    }

    /** @return array<string, mixed> */
    public function moduleApiReport(string $pathOrSlug): array
    {
        $path = $this->resolveModulePath($pathOrSlug);
        return array_merge(
            ['path' => $path],
            $this->checker->checkDirectory($path)
        );
    }

    /** @return array<string, mixed> */
    private function stepManifest(string $path): array
    {
        $errors = [];
        $findings = [];
        $manifest = null;
        $manifestPath = rtrim($path, '/\\') . '/module.json';
        if (!is_file($manifestPath)) {
            $errors[] = 'module.json missing';
            $findings[] = $this->analyzerFinding('', 0, 'manifest', 'critical', 'module.json missing', 'Add module.json at package root');
        } else {
            $data = json_decode((string) file_get_contents($manifestPath), true);
            if (!is_array($data)) {
                $errors[] = 'module.json invalid JSON';
                $findings[] = $this->analyzerFinding('', 0, 'manifest', 'critical', 'module.json invalid JSON', 'Fix JSON syntax');
            } else {
                try {
                    $manifest = ModuleManifest::fromArray($data);
                } catch (\Throwable $e) {
                    $errors[] = 'module.json invalid: ' . $e->getMessage();
                    $findings[] = $this->analyzerFinding('module.json', 1, 'manifest', 'critical', $e->getMessage(), 'Fix module.json schema');
                }
            }
        }
        return [
            'name' => 'manifest',
            'ok' => $errors === [],
            'errors' => $errors,
            'manifest' => $manifest,
            'findings' => $findings,
        ];
    }

    /** @return array<string, mixed> */
    private function stepPhpLint(string $path): array
    {
        $findings = [];
        $ok = true;
        $root = rtrim(str_replace('\\', '/', $path), '/');
        $it = new \RecursiveIteratorIterator(
            new \RecursiveDirectoryIterator($root, \FilesystemIterator::SKIP_DOTS)
        );
        foreach ($it as $file) {
            if (!$file->isFile() || strtolower($file->getExtension()) !== 'php') {
                continue;
            }
            $full = str_replace('\\', '/', $file->getPathname());
            if (str_contains($full, '/vendor/') || str_contains($full, '/node_modules/')) {
                continue;
            }
            $rel = ltrim(substr($full, strlen($root)), '/');
            $cmd = escapeshellarg(PHP_BINARY) . ' -l ' . escapeshellarg($full) . ' 2>&1';
            $out = [];
            $code = 0;
            exec($cmd, $out, $code);
            if ($code !== 0) {
                $ok = false;
                $findings[] = $this->analyzerFinding($rel, 1, 'php_lint', 'critical', implode(' ', $out), 'Fix PHP syntax errors');
            }
        }
        return ['name' => 'php_lint', 'ok' => $ok, 'findings' => $findings];
    }

    /** @return array<string, mixed> */
    private function stepMigrations(string $path, mixed $manifest): array
    {
        $findings = [];
        $ok = true;
        if (!$manifest instanceof ModuleManifest) {
            return ['name' => 'migrations', 'ok' => true, 'skipped' => true, 'findings' => []];
        }
        $migPath = $manifest->migrationsPath();
        $dir = rtrim($path, '/\\') . '/' . ltrim($migPath, '/');
        if (!is_dir($dir)) {
            return ['name' => 'migrations', 'ok' => true, 'note' => 'No migrations directory', 'findings' => []];
        }
        $hasSql = false;
        foreach (glob($dir . '/*.sql') ?: [] as $sql) {
            $hasSql = true;
            break;
        }
        if (!$hasSql) {
            $ok = false;
            $findings[] = $this->analyzerFinding($migPath, 0, 'migrations', 'high', 'Migrations path has no .sql files', 'Add at least one migration SQL or remove migrations.path');
        }
        return ['name' => 'migrations', 'ok' => $ok, 'findings' => $findings];
    }

    /** @return array<string, mixed> */
    private function stepFrontendImports(string $path): array
    {
        $static = $this->analyzer->analyzeDirectory($path);
        $feFindings = array_values(array_filter(
            $static['findings'],
            static fn(array $f): bool => $f['rule'] === 'forbidden_frontend_import'
        ));
        return [
            'name' => 'frontend_imports',
            'ok' => $feFindings === [],
            'findings' => $feFindings,
        ];
    }

    /** @return array<string, mixed> */
    private function stepOptionalTypecheck(string $path): array
    {
        $feDir = $path . '/frontend';
        $tsconfig = $feDir . '/tsconfig.json';
        if (!is_file($tsconfig)) {
            return [
                'name' => 'frontend_typecheck',
                'ok' => true,
                'skipped' => true,
                'note' => 'No frontend/tsconfig.json — typecheck skipped',
            ];
        }
        $pkg = $feDir . '/package.json';
        if (!is_file($pkg)) {
            return [
                'name' => 'frontend_typecheck',
                'ok' => true,
                'skipped' => true,
                'note' => 'frontend/package.json missing — typecheck skipped',
            ];
        }
        return [
            'name' => 'frontend_typecheck',
            'ok' => true,
            'skipped' => true,
            'optional' => true,
            'note' => 'Run npm/tsc in module frontend manually or via build-module.js',
        ];
    }

    /** @return array<string, mixed> */
    private function stepOptionalFrontendBuild(string $path): array
    {
        $pkg = $path . '/frontend/package.json';
        if (!is_file($pkg)) {
            return [
                'name' => 'frontend_build',
                'ok' => true,
                'skipped' => true,
                'note' => 'No frontend/package.json',
            ];
        }
        return [
            'name' => 'frontend_build',
            'ok' => true,
            'optional' => true,
            'note' => 'Optional: build frontend to frontend-dist before packaging (node scripts/build-module.js)',
        ];
    }

    /**
     * @param array{ok:bool, findings:list<array<string,mixed>>} $static
     */
    private function staticPasses(array $static): bool
    {
        foreach ($static['findings'] as $f) {
            if (in_array($f['severity'], ['critical', 'high'], true)) {
                return false;
            }
        }
        return true;
    }

    /**
     * @param list<array{severity:string,message:string,file:string,line:int}> $findings
     * @param list<string> $severities
     * @return list<string>
     */
    private function collectMessages(array $findings, array $severities): array
    {
        $out = [];
        foreach ($findings as $f) {
            if (!in_array($f['severity'], $severities, true)) {
                continue;
            }
            $out[] = ($f['file'] ?? '') !== ''
                ? ($f['file'] . ':' . ($f['line'] ?? 0) . ' ' . ($f['message'] ?? ''))
                : (string) ($f['message'] ?? '');
        }
        return array_values(array_unique($out));
    }

    /**
     * @param list<array{severity:string}> $findings
     */
    private function scoreFromFindings(array $findings, int $baseScore): int
    {
        $score = $baseScore;
        foreach ($findings as $f) {
            $score -= match ($f['severity']) {
                'critical' => 25,
                'high' => 15,
                'medium' => 5,
                default => 2,
            };
        }
        return max(0, $score);
    }

    /** @return array{file:string,line:int,rule:string,severity:string,message:string,recommendation:string} */
    private function analyzerFinding(string $file, int $line, string $rule, string $severity, string $message, string $recommendation): array
    {
        return [
            'file' => $file,
            'line' => $line,
            'rule' => $rule,
            'severity' => $severity,
            'message' => $message,
            'recommendation' => $recommendation,
        ];
    }
}
