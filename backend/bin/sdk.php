<?php
declare(strict_types=1);

/**
 * Platform SDK CLI
 * Usage:
 *   php backend/bin/sdk.php validate-sdk <path-or-slug>
 *   php backend/bin/sdk.php verify-compatibility <path-or-slug>
 *   php backend/bin/sdk.php export-sdk
 *   php backend/bin/sdk.php list-capabilities
 *   php backend/bin/sdk.php sdk-report
 *   php backend/bin/sdk.php module-api-report <path>
 */

$root = dirname(__DIR__);
require_once $root . '/src/Bootstrap.php';

use App\Bootstrap;
use App\Platform\Analysis\CompatibilityChecker;
use App\Platform\Capabilities\CapabilityRegistry;
use App\Platform\Manifest\PublicApiRegistry;
use App\Platform\SdkVersion;

Bootstrap::registerAutoload();

$db = null;
try {
    [$app, $db, $registry] = Bootstrap::init();
    unset($app, $registry);
} catch (Throwable $e) {
    // Offline / CI without DB — CapabilityRegistry uses in-memory core defaults.
}

$cmd = $argv[1] ?? '';
$arg = $argv[2] ?? '';

function resolveModulePath(string $arg, string $repoRoot): string
{
    if ($arg === '') {
        throw new RuntimeException('Path or slug required');
    }
    if (is_dir($arg)) {
        return realpath($arg) ?: $arg;
    }
    $src = $repoRoot . '/modules-src/' . $arg;
    if (is_dir($src)) {
        return $src;
    }
    $candidates = [
        dirname($repoRoot) . '/modules/' . $arg,
        $repoRoot . '/../modules/' . $arg,
        $repoRoot . '/modules/' . $arg,
    ];
    foreach ($candidates as $c) {
        if (is_dir($c)) {
            return realpath($c) ?: $c;
        }
    }
    throw new RuntimeException('Module path not found: ' . $arg);
}

try {
    $repoRoot = dirname($root);
    switch ($cmd) {
        case 'validate-sdk':
        case 'verify-compatibility':
            $path = resolveModulePath($arg, $repoRoot);
            $checker = new CompatibilityChecker(db: $db);
            $report = $checker->checkDirectory($path);
            echo json_encode($report, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE) . PHP_EOL;
            exit($report['ok'] ? 0 : 2);

        case 'export-sdk':
            $reg = new PublicApiRegistry();
            $manifest = $reg->exportManifest();
            $out = $root . '/src/Platform/Manifest/platform.manifest.json';
            file_put_contents($out, json_encode($manifest, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE) . "\n");
            echo "Wrote {$out}\n";
            exit(0);

        case 'list-capabilities':
            $caps = new CapabilityRegistry($db);
            echo json_encode([
                'capabilities' => $caps->list(),
                'providers' => $caps->dump(),
            ], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE) . PHP_EOL;
            exit(0);

        case 'sdk-report':
            $reg = new PublicApiRegistry();
            echo json_encode([
                'current' => SdkVersion::CURRENT,
                'supported' => SdkVersion::SUPPORTED,
                'min_supported' => SdkVersion::MIN_SUPPORTED,
                'public_api' => $reg->listApis(),
            ], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE) . PHP_EOL;
            exit(0);

        case 'module-api-report':
            $path = resolveModulePath($arg !== '' ? $arg : 'demo-kit', $repoRoot);
            $checker = new CompatibilityChecker(db: $db);
            echo json_encode($checker->checkDirectory($path), JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE) . PHP_EOL;
            exit(0);

        default:
            fwrite(STDERR, "Unknown command. See header of bin/sdk.php\n");
            exit(1);
    }
} catch (Throwable $e) {
    fwrite(STDERR, $e->getMessage() . PHP_EOL);
    exit(1);
}
