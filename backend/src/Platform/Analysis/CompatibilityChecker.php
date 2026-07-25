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
    public function __construct(
        private PackageStaticAnalyzer $analyzer = new PackageStaticAnalyzer(),
        private ?Database $db = null,
    ) {}

    /**
     * @return array{
     *   ok:bool,
     *   score:int,
     *   errors:list<string>,
     *   warnings:list<string>,
     *   recommendations:list<string>,
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

        $manifestPath = rtrim($root, '/\\') . '/module.json';
        $manifest = null;
        if (!is_file($manifestPath)) {
            $errors[] = 'module.json missing';
        } else {
            $data = json_decode((string) file_get_contents($manifestPath), true);
            if (!is_array($data)) {
                $errors[] = 'module.json invalid JSON';
            } else {
                $manifest = ModuleManifest::fromArray($data);
            }
        }

        $sdkModule = $manifest?->sdkVersion() ?? 0;
        $sdkCheck = CompatibilityLayer::checkSdkVersion($sdkModule > 0 ? $sdkModule : 1);
        $errors = array_merge($errors, $sdkCheck['errors']);
        $warnings = array_merge($warnings, $sdkCheck['warnings']);

        $caps = new CapabilityRegistry($this->db);
        $required = $manifest?->requiredCapabilities() ?? [];
        $missing = [];
        foreach ($required as $cap) {
            if (!$caps->has($cap)) {
                $missing[] = $cap;
                $errors[] = 'Missing capability: ' . $cap;
            }
        }

        $static = $this->analyzer->analyzeDirectory($root);
        $errors = array_merge($errors, $static['errors']);
        $warnings = array_merge($warnings, $static['warnings']);

        if ($manifest !== null && $sdkModule < SdkVersion::CURRENT) {
            $recommendations[] = 'Upgrade module to SDK v' . SdkVersion::CURRENT . ' when convenient';
        }
        if ($static['errors'] !== []) {
            $recommendations[] = 'Replace Core/Modules imports with App\\Platform\\PlatformContext APIs';
        }
        if (($manifest?->providedCapabilities() ?? []) === []) {
            $recommendations[] = 'Declare capabilities.provides in module.json for Service Discovery';
        }

        $score = 100;
        $score -= min(60, count($errors) * 15);
        $score -= min(30, count($warnings) * 5);
        $score = max(0, $score);

        return [
            'ok' => $errors === [],
            'score' => $score,
            'errors' => $errors,
            'warnings' => $warnings,
            'recommendations' => $recommendations,
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
}
