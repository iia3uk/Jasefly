<?php
declare(strict_types=1);

/**
 * Platform SDK lifecycle certification script.
 *
 * Offline checks always run via PlatformPackageLifecycleTest (also in run.php).
 * Full install/enable lifecycle requires MySQL (Bootstrap::init) and
 *   JASEFLY_LIFECYCLE_DB=1
 *
 * CI without MySQL: exits 0 with {ok:true, skipped:true, reason:"no database"}.
 */

$root = dirname(__DIR__);
require_once "$root/src/Bootstrap.php";
\App\Bootstrap::registerAutoload();

$repoRoot = dirname($root);
$slug = 'forms-sdk-reference';
$moduleSrc = $repoRoot . '/modules-src/' . $slug;

$result = [
    'ok' => true,
    'skipped' => false,
    'offline' => [],
    'lifecycle' => [],
];

// —— Offline checks (same as PlatformPackageLifecycleTest) ——
$failed = 0;
$passed = 0;

function assert_true(bool $cond, string $msg): void
{
    global $failed, $passed;
    if ($cond) {
        $passed++;
    } else {
        $failed++;
    }
}

require_once "$root/tests/PlatformPackageLifecycleTest.php";
$result['offline'] = ['passed' => $passed, 'failed' => $failed];
if ($failed > 0) {
    $result['ok'] = false;
    echo json_encode($result, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE) . PHP_EOL;
    exit(1);
}

// —— DB availability ——
$db = null;
$app = null;
try {
    [$app, $db] = \App\Bootstrap::init();
    unset($app);
} catch (Throwable $e) {
    $result['skipped'] = true;
    $result['reason'] = 'no database';
    $result['detail'] = $e->getMessage();
    echo json_encode($result, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE) . PHP_EOL;
    exit(0);
}

if (getenv('JASEFLY_LIFECYCLE_DB') !== '1') {
    $result['lifecycle'][] = ['step' => 'db_lifecycle', 'skipped' => true, 'note' => 'Set JASEFLY_LIFECYCLE_DB=1 to run install lifecycle'];
    echo json_encode($result, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE) . PHP_EOL;
    exit(0);
}

// —— Build ZIP if missing ——
$releaseDir = $repoRoot . '/release/modules';
$zipPattern = $releaseDir . '/jasefly-module-' . $slug . '-*.zip';
$existing = glob($zipPattern) ?: [];
$zipPath = $existing !== [] ? $existing[count($existing) - 1] : null;

if ($zipPath === null || !is_file($zipPath)) {
    $buildScript = $repoRoot . '/scripts/build-module.js';
    if (!is_file($buildScript)) {
        $result['ok'] = false;
        $result['lifecycle'][] = ['step' => 'build_zip', 'ok' => false, 'error' => 'build-module.js missing'];
        echo json_encode($result, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE) . PHP_EOL;
        exit(1);
    }
    $cmd = 'node ' . escapeshellarg($buildScript) . ' ' . escapeshellarg($slug) . ' --yes';
    exec($cmd . ' 2>&1', $buildOut, $buildCode);
    $existing = glob($zipPattern) ?: [];
    $zipPath = $existing !== [] ? $existing[count($existing) - 1] : null;
    $result['lifecycle'][] = [
        'step' => 'build_zip',
        'ok' => $buildCode === 0 && $zipPath !== null,
        'exit_code' => $buildCode,
        'zip' => $zipPath,
    ];
    if ($buildCode !== 0 || $zipPath === null) {
        $result['ok'] = false;
        $result['lifecycle'][] = ['step' => 'build_zip', 'output' => implode("\n", array_slice($buildOut, -20))];
        echo json_encode($result, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE) . PHP_EOL;
        exit(1);
    }
} else {
    $result['lifecycle'][] = ['step' => 'build_zip', 'ok' => true, 'skipped' => true, 'zip' => $zipPath];
}

// —— Install lifecycle via ModulePackageService ——
try {
    $appConfig = require $repoRoot . '/backend/config/app.php';
    $paths = \App\Core\Modules\ModulePackagePaths::fromApp($appConfig);
    $repo = new \App\Services\Modules\ModuleRegistryRepository($db);
    $staging = new \App\Services\Modules\ModuleStagingService();
    $snapshots = new \App\Services\Modules\ModuleSnapshotService($paths);
    $migrations = new \App\Services\Modules\ModuleMigrationService($db);
    $hooks = new \App\Services\Modules\ModuleHookRunner();
    $health = new \App\Services\Modules\ModuleHealthService($paths);
    $svc = new \App\Services\Modules\ModulePackageService(
        $db,
        $appConfig,
        $paths,
        $repo,
        $staging,
        $snapshots,
        $migrations,
        $hooks,
        $health,
    );

    // Upload local zip
    $upload = $svc->upload([
        'tmp_name' => $zipPath,
        'name' => basename($zipPath),
        'size' => filesize($zipPath) ?: 0,
        'error' => UPLOAD_ERR_OK,
        'allow_local_path' => true,
    ]);
    $packageId = $upload['package_id'];
    $result['lifecycle'][] = ['step' => 'upload', 'ok' => true, 'package_id' => $packageId];

    $inspect = $svc->inspect($packageId);
    $result['lifecycle'][] = ['step' => 'inspect', 'ok' => ($inspect['ok'] ?? true), 'plan' => $inspect['plan'] ?? null];

    $installed = $repo->getBySlug($slug);
    if ($installed === null) {
        $install = $svc->install($packageId, ['initiated_by' => null]);
        $result['lifecycle'][] = ['step' => 'install', 'ok' => true, 'version' => $install['version'] ?? '1.0.0'];
    } else {
        $result['lifecycle'][] = ['step' => 'install', 'ok' => true, 'skipped' => true, 'note' => 'already installed'];
    }

    $enable = $svc->enable($slug, null);
    $result['lifecycle'][] = ['step' => 'enable', 'ok' => ($enable['enabled'] ?? true)];

    $healthSvc = new \App\Services\Modules\ModuleHealthService($repo, $paths, $migrations, $appConfig);
    $healthReport = $healthSvc->check($slug);
    $result['lifecycle'][] = ['step' => 'health', 'ok' => ($healthReport['ok'] ?? false), 'report' => $healthReport];

    if (!($healthReport['ok'] ?? false)) {
        $result['ok'] = false;
    }
} catch (Throwable $e) {
    $result['ok'] = false;
    $result['lifecycle'][] = ['step' => 'lifecycle_error', 'ok' => false, 'error' => $e->getMessage()];
}

echo json_encode($result, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE) . PHP_EOL;
exit($result['ok'] ? 0 : 1);
