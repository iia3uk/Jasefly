<?php
declare(strict_types=1);

/**
 * Platform SDK lifecycle certification script.
 *
 * Offline checks always run via PlatformPackageLifecycleTest (also in run.php).
 * Full install/update/rollback/uninstall requires MySQL (Bootstrap::init) and
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
if (!is_dir($moduleSrc)) {
    $moduleSrc = $repoRoot . '/backend/tests/fixtures/modules/' . $slug;
}
$manifestPath = $moduleSrc . '/module.json';

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
try {
    [, $db] = \App\Bootstrap::init();
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

$buildModuleZip = static function (string $slug, ?string $version, string $outDir) use ($repoRoot): array {
    $buildScript = $repoRoot . '/scripts/build-module.js';
    if (!is_dir($outDir)) {
        @mkdir($outDir, 0775, true);
    }
    $cmd = 'node ' . escapeshellarg($buildScript) . ' ' . escapeshellarg($slug);
    if ($version !== null) {
        $cmd .= ' --version=' . escapeshellarg($version);
    }
    $cmd .= ' --output=' . escapeshellarg($outDir) . ' --yes';
    $buildOut = [];
    $buildCode = 0;
    exec($cmd . ' 2>&1', $buildOut, $buildCode);
    $pattern = rtrim($outDir, '/\\') . '/jasefly-module-' . $slug . '-' . ($version ?? '*') . '.zip';
    $existing = glob($pattern) ?: [];
    if ($existing === [] && $version === null) {
        $existing = glob(rtrim($outDir, '/\\') . '/jasefly-module-' . $slug . '-*.zip') ?: [];
    }
    $zipPath = $existing !== [] ? $existing[count($existing) - 1] : null;
    return [
        'ok' => $buildCode === 0 && $zipPath !== null && is_file($zipPath),
        'exit_code' => $buildCode,
        'zip' => $zipPath,
        'output' => implode("\n", array_slice($buildOut, -30)),
    ];
};

$healthOk = static function (array $report): bool {
    $status = (string) ($report['status'] ?? '');
    return in_array($status, ['healthy', 'warning'], true);
};

// —— Install lifecycle via ModulePackageService ——
$originalManifestJson = is_file($manifestPath) ? (string) file_get_contents($manifestPath) : null;
$tempOut = sys_get_temp_dir() . '/jasefly-lifecycle-zips-' . bin2hex(random_bytes(3));
@mkdir($tempOut, 0775, true);

try {
    $appConfig = require $repoRoot . '/backend/config/app.php';
    $paths = \App\Core\Modules\ModulePackagePaths::fromApp($appConfig);
    $repo = new \App\Services\Modules\ModuleRegistryRepository($db);
    $staging = new \App\Services\Modules\ModuleStagingService($paths);
    $snapshots = new \App\Services\Modules\ModuleSnapshotService($paths, $repo);
    $migrations = new \App\Services\Modules\ModuleMigrationService($db);
    $hooks = new \App\Services\Modules\ModuleHookRunner();
    $health = new \App\Services\Modules\ModuleHealthService($repo, $paths, $migrations, $appConfig);
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

    // Clean slate if a previous run left the module installed
    if ($repo->getBySlug($slug) !== null) {
        $svc->uninstall($slug, true, null);
        $result['lifecycle'][] = ['step' => 'pre_uninstall', 'ok' => true];
    }

    // Build v1.0.0 ZIP (use current modules-src version; do not bump)
    $buildV1 = $buildModuleZip($slug, null, $tempOut);
    $result['lifecycle'][] = [
        'step' => 'build_zip_v1',
        'ok' => $buildV1['ok'],
        'zip' => $buildV1['zip'],
        'exit_code' => $buildV1['exit_code'],
    ];
    if (!$buildV1['ok']) {
        $result['ok'] = false;
        $result['lifecycle'][] = ['step' => 'build_zip_v1', 'output' => $buildV1['output']];
        throw new RuntimeException('Failed to build v1 module ZIP');
    }
    $zipPath = $buildV1['zip'];

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
    if (!($inspect['ok'] ?? true)) {
        $result['ok'] = false;
        throw new RuntimeException('Inspect failed: ' . implode('; ', $inspect['errors'] ?? []));
    }

    $install = $svc->install($packageId, ['initiated_by' => null]);
    $v1 = (string) ($install['version'] ?? '1.0.0');
    $result['lifecycle'][] = ['step' => 'install', 'ok' => true, 'version' => $v1];

    $enable = $svc->enable($slug, null);
    $enableOk = ($enable['ok'] ?? false) === true || ($enable['status'] ?? '') === 'enabled';
    $result['lifecycle'][] = ['step' => 'enable', 'ok' => $enableOk, 'status' => $enable['status'] ?? null];
    if (!$enableOk) {
        $result['ok'] = false;
    }

    $healthReport = $health->check($slug);
    $result['lifecycle'][] = ['step' => 'health', 'ok' => $healthOk($healthReport), 'report' => $healthReport];
    if (!$healthOk($healthReport)) {
        $result['ok'] = false;
        throw new RuntimeException('Health check failed after install');
    }

    // Build v1.1.0 into temp output; restore modules-src/module.json afterwards
    $buildV11 = $buildModuleZip($slug, '1.1.0', $tempOut);
    if ($originalManifestJson !== null) {
        file_put_contents($manifestPath, $originalManifestJson);
    }
    $result['lifecycle'][] = [
        'step' => 'build_zip_v1_1',
        'ok' => $buildV11['ok'],
        'zip' => $buildV11['zip'],
        'exit_code' => $buildV11['exit_code'],
    ];
    if (!$buildV11['ok']) {
        $result['ok'] = false;
        $result['lifecycle'][] = ['step' => 'build_zip_v1_1', 'output' => $buildV11['output']];
        throw new RuntimeException('Failed to build v1.1.0 module ZIP');
    }

    $upload2 = $svc->upload([
        'tmp_name' => $buildV11['zip'],
        'name' => basename((string) $buildV11['zip']),
        'size' => filesize((string) $buildV11['zip']) ?: 0,
        'error' => UPLOAD_ERR_OK,
        'allow_local_path' => true,
    ]);
    $update = $svc->update($upload2['package_id'], $slug, null);
    $updatedVersion = (string) ($update['version'] ?? '');
    $updateOk = ($update['ok'] ?? false) === true && $updatedVersion === '1.1.0';
    $result['lifecycle'][] = ['step' => 'update', 'ok' => $updateOk, 'version' => $updatedVersion];
    if (!$updateOk) {
        $result['ok'] = false;
        throw new RuntimeException('Update to 1.1.0 failed');
    }

    $rowAfterUpdate = $repo->getBySlug($slug);
    $installedAfterUpdate = (string) ($rowAfterUpdate['installed_version'] ?? '');
    $result['lifecycle'][] = [
        'step' => 'assert_updated_version',
        'ok' => $installedAfterUpdate === '1.1.0',
        'installed_version' => $installedAfterUpdate,
    ];
    if ($installedAfterUpdate !== '1.1.0') {
        $result['ok'] = false;
        throw new RuntimeException('Registry version after update is not 1.1.0');
    }

    $rollback = $svc->rollback($slug, null);
    $toVersion = (string) ($rollback['to_version'] ?? '');
    $rollbackOk = ($rollback['ok'] ?? false) === true && $toVersion === $v1;
    $result['lifecycle'][] = [
        'step' => 'rollback',
        'ok' => $rollbackOk,
        'from_version' => $rollback['from_version'] ?? null,
        'to_version' => $toVersion,
    ];
    if (!$rollbackOk) {
        $result['ok'] = false;
        throw new RuntimeException('Rollback did not restore ' . $v1);
    }

    $rowAfterRollback = $repo->getBySlug($slug);
    $installedAfterRollback = (string) ($rowAfterRollback['installed_version'] ?? '');
    $result['lifecycle'][] = [
        'step' => 'assert_rollback_version',
        'ok' => $installedAfterRollback === $v1,
        'installed_version' => $installedAfterRollback,
    ];

    $uninstall = $svc->uninstall($slug, true, null);
    $uninstallOk = ($uninstall['ok'] ?? false) === true && ($uninstall['keep_data'] ?? false) === true;
    $result['lifecycle'][] = ['step' => 'uninstall_keep_data', 'ok' => $uninstallOk];

    $gone = $repo->getBySlug($slug) === null;
    $preserved = $paths->moduleStorage($slug) . '/preserved.json';
    $preservedOk = is_file($preserved);
    $result['lifecycle'][] = [
        'step' => 'assert_uninstalled',
        'ok' => $gone && $preservedOk,
        'registry_cleared' => $gone,
        'preserved_json' => $preservedOk,
    ];
    if (!$gone || !$preservedOk) {
        $result['ok'] = false;
    }
} catch (Throwable $e) {
    $result['ok'] = false;
    $result['lifecycle'][] = ['step' => 'lifecycle_error', 'ok' => false, 'error' => $e->getMessage()];
} finally {
    if ($originalManifestJson !== null && is_file($manifestPath)) {
        $current = (string) file_get_contents($manifestPath);
        if ($current !== $originalManifestJson) {
            file_put_contents($manifestPath, $originalManifestJson);
        }
    }
    // Best-effort cleanup of temp ZIPs
    if (is_dir($tempOut)) {
        foreach (glob($tempOut . '/*') ?: [] as $f) {
            @unlink($f);
        }
        @rmdir($tempOut);
    }
}

echo json_encode($result, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE) . PHP_EOL;
exit($result['ok'] ? 0 : 1);
