<?php
declare(strict_types=1);

/**
 * Platform SDK CLI
 * Usage:
 *   php backend/bin/sdk.php validate-sdk <path-or-slug>
 *   php backend/bin/sdk.php verify-compatibility <path-or-slug>
 *   php backend/bin/sdk.php verify-module <path-or-slug>
 *   php backend/bin/sdk.php certify <path-or-slug>
 *   php backend/bin/sdk.php export-sdk
 *   php backend/bin/sdk.php api-snapshot
 *   php backend/bin/sdk.php api-diff
 *   php backend/bin/sdk.php list-capabilities
 *   php backend/bin/sdk.php list-public-services
 *   php backend/bin/sdk.php deprecations
 *   php backend/bin/sdk.php compatibility-matrix
 *   php backend/bin/sdk.php sdk-report
 *   php backend/bin/sdk.php module-api-report <path>
 */

$root = dirname(__DIR__);
require_once $root . '/src/Bootstrap.php';

use App\Bootstrap;
use App\Platform\Analysis\SdkCliService;

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
$repoRoot = dirname($root);
$cli = new SdkCliService($db, $repoRoot, $root);

try {
    switch ($cmd) {
        case 'validate-sdk':
            $report = $cli->validateSdk($arg);
            echo json_encode($report, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE) . PHP_EOL;
            exit($report['ok'] ? 0 : 2);

        case 'verify-compatibility':
            $report = $cli->verifyCompatibility($arg);
            echo json_encode($report, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE) . PHP_EOL;
            exit($report['ok'] ? 0 : 2);

        case 'verify-module':
            $report = $cli->verifyModule($arg);
            echo json_encode($report, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE) . PHP_EOL;
            exit($report['ok'] ? 0 : 2);

        case 'certify':
            $report = $cli->certify($arg);
            echo json_encode($report, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE) . PHP_EOL;
            exit($report['ok'] ? 0 : 2);

        case 'export-sdk':
            $result = $cli->exportSdk();
            echo "Wrote {$result['path']}\n";
            exit(0);

        case 'api-snapshot':
            $result = $cli->apiSnapshot();
            echo "Wrote {$result['path']}\n";
            exit(0);

        case 'api-diff':
            $diff = $cli->apiDiff();
            echo json_encode($diff, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE) . PHP_EOL;
            exit($diff['ok'] ? 0 : 2);

        case 'list-capabilities':
            echo json_encode($cli->listCapabilities(), JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE) . PHP_EOL;
            exit(0);

        case 'list-public-services':
            echo json_encode($cli->listPublicServices(), JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE) . PHP_EOL;
            exit(0);

        case 'deprecations':
            echo json_encode($cli->deprecations(), JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE) . PHP_EOL;
            exit(0);

        case 'compatibility-matrix':
            echo json_encode($cli->compatibilityMatrix(), JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE) . PHP_EOL;
            exit(0);

        case 'sdk-report':
            echo json_encode($cli->sdkReport(), JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE) . PHP_EOL;
            exit(0);

        case 'module-api-report':
            $pathArg = $arg !== '' ? $arg : 'demo-kit';
            echo json_encode($cli->moduleApiReport($pathArg), JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE) . PHP_EOL;
            exit(0);

        default:
            fwrite(STDERR, "Unknown command: {$cmd}\nSee header of bin/sdk.php\n");
            exit(1);
    }
} catch (Throwable $e) {
    fwrite(STDERR, $e->getMessage() . PHP_EOL);
    exit(1);
}
