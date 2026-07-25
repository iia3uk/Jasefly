<?php
declare(strict_types=1);

namespace App\Platform\Analysis;

use App\Core\Modules\ModuleManifest;
use App\Platform\Capabilities\CapabilityRegistry;
use App\Platform\Compatibility\CompatibilityLayer;
use App\Platform\SdkVersion;
use App\Database;

/**
 * Full compatibility report for a package directory or installed slug.
 */
final class CompatibilityChecker
{
    private PackageStaticAnalyzer $analyzer;

    public function __construct(
        ?PackageStaticAnalyzer $analyzer = null,
        private ?Database $db = null,
    ) {
        $this->analyzer = $analyzer ?? new PackageStaticAnalyzer();
    }

    /**
     * @return array{
     *   ok:bool,
     *   score:int,
     *   errors:list<string>,
     *   warnings:list<string>,
     *   recommendations:list<string>,
     *   findings:list<array{file:string,line:int,rule:string,severity:string,message:string,recommendation:string}>,
     *   sdk:array{module:int, platform:int, supported:list<int>},
     *   capabilities:array{required:list<string>, missing:list<string>},
     *   static:array{ok:bool, files_scanned:int}
     * }
     */
    public function checkDirectory(string $root): array
    {
        $errors = [];
        $warnings = [];
        $recommendations = [];
        $findings = [];

        $manifestPath = rtrim($root, '/\\') . '/module.json';
        $manifest = null;
        if (!is_file($manifestPath)) {
            $errors[] = 'module.json missing';
            $findings[] = $this->finding('', 0, 'manifest', 'critical', 'module.json missing', 'Add module.json');
        } else {
            $data = json_decode((string) file_get_contents($manifestPath), true);
            if (!is_array($data)) {
                $errors[] = 'module.json invalid JSON';
                $findings[] = $this->finding('module.json', 1, 'manifest', 'critical', 'module.json invalid JSON', 'Fix JSON');
            } else {
                $manifest = ModuleManifest::fromArray($data);
            }
        }

        $sdkModule = $manifest?->sdkVersion() ?? 0;
        $sdkCheck = CompatibilityLayer::checkSdkVersion($sdkModule > 0 ? $sdkModule : 1);
        foreach ($sdkCheck['errors'] as $msg) {
            $errors[] = $msg;
            $findings[] = $this->finding('module.json', 1, 'sdk_version', 'critical', $msg, 'Set jasefly.sdk_version to a supported value');
        }
        foreach ($sdkCheck['warnings'] as $msg) {
            $warnings[] = $msg;
            $findings[] = $this->finding('module.json', 1, 'sdk_version', 'medium', $msg, 'Consider upgrading SDK generation');
        }

        $caps = new CapabilityRegistry($this->db);
        $required = $manifest?->requiredCapabilities() ?? [];
        $missing = [];
        foreach ($required as $cap) {
            if (!$caps->has($cap)) {
                $missing[] = $cap;
                $msg = 'Missing capability: ' . $cap;
                $errors[] = $msg;
                $findings[] = $this->finding('module.json', 1, 'capability', 'high', $msg, 'Require only capabilities provided by the host CMS');
            }
        }

        $static = $this->analyzer->analyzeDirectory($root);
        $errors = array_merge($errors, $static['errors']);
        $warnings = array_merge($warnings, $static['warnings']);
        $findings = array_merge($findings, $static['findings']);

        if ($manifest !== null && $sdkModule < SdkVersion::CURRENT) {
            $recommendations[] = 'Upgrade module to SDK v' . SdkVersion::CURRENT . ' when convenient';
        }
        if ($static['errors'] !== []) {
            $recommendations[] = 'Replace Core/Modules imports with App\\Platform\\PlatformContext APIs';
        }
        if (($manifest?->providedCapabilities() ?? []) === []) {
            $recommendations[] = 'Declare capabilities.provides in module.json for Service Discovery';
        }

        $score = $this->computeScore($findings, count($errors), count($warnings));

        return [
            'ok' => $errors === [],
            'score' => $score,
            'errors' => $errors,
            'warnings' => $warnings,
            'recommendations' => $recommendations,
            'findings' => $findings,
            'sdk' => [
                'module' => $sdkModule > 0 ? $sdkModule : 1,
                'platform' => SdkVersion::CURRENT,
                'supported' => SdkVersion::SUPPORTED,
            ],
            'capabilities' => [
                'required' => $required,
                'missing' => $missing,
            ],
            'static' => [
                'ok' => $static['ok'],
                'files_scanned' => $static['files_scanned'],
            ],
        ];
    }

    /**
     * @param list<array{severity:string}> $findings
     */
    private function computeScore(array $findings, int $errorCount, int $warningCount): int
    {
        $score = 100;
        foreach ($findings as $f) {
            $score -= match ($f['severity']) {
                'critical' => 25,
                'high' => 15,
                'medium' => 5,
                default => 2,
            };
        }
        $score -= min(20, max(0, $errorCount - count(array_filter($findings, fn($f) => in_array($f['severity'], ['critical', 'high'], true)))) * 5);
        $score -= min(10, $warningCount * 2);
        return max(0, $score);
    }

    /** @return array{file:string,line:int,rule:string,severity:string,message:string,recommendation:string} */
    private function finding(string $file, int $line, string $rule, string $severity, string $message, string $recommendation): array
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
