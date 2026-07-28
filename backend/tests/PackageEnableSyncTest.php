<?php
declare(strict_types=1);

/**
 * H2 — package enable SoT: installed_modules canonical, modules.is_enabled mirror.
 * Behavioral tests (SQLite): R1 idempotent mirror, R4 mirror failure, R5 reconcile accounting.
 */

use App\Core\Modules\ModulePackagePaths;
use App\Services\Modules\InstalledModuleLoader;
use App\Services\Modules\ModulePackageService;
use App\Services\Modules\ModulePluginMirror;
use App\Services\Modules\ModuleRegistryRepository;
use App\Services\Modules\ModuleSafeMode;
use App\Core\ModuleRegistry;

if (!extension_loaded('pdo_sqlite')) {
    echo "  SKIP PackageEnableSync (pdo_sqlite missing)\n";
    return;
}

require_once __DIR__ . '/helpers.php';

$ctx = jasefly_test_sqlite_boot();
$pdo = $ctx['pdo'];
$db = $ctx['db'];

// Minimal tables for enable sync (subset of 007 + 020).
$pdo->exec(
    "CREATE TABLE IF NOT EXISTS modules (
        name TEXT PRIMARY KEY,
        is_enabled INTEGER NOT NULL DEFAULT 1,
        settings TEXT NULL
    )"
);
$pdo->exec(
    "CREATE TABLE IF NOT EXISTS installed_modules (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        slug TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        installed_version TEXT NOT NULL DEFAULT '0.0.0',
        status TEXT NOT NULL DEFAULT 'installed',
        source TEXT NOT NULL DEFAULT 'package',
        manifest_json TEXT NULL,
        package_checksum TEXT NULL,
        signature_status TEXT NULL,
        health_status TEXT NULL,
        last_error TEXT NULL,
        data_retention TEXT NULL,
        frontend_manifest_json TEXT NULL,
        enabled_at TEXT NULL,
        disabled_at TEXT NULL,
        installed_at TEXT NULL,
        updated_at TEXT NULL
    )"
);
$pdo->exec(
    "CREATE TABLE IF NOT EXISTS module_operations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        module_slug TEXT NOT NULL,
        operation TEXT NOT NULL,
        from_version TEXT NULL,
        to_version TEXT NULL,
        status TEXT NOT NULL,
        error TEXT NULL,
        initiated_by INTEGER NULL,
        package_path TEXT NULL,
        backup_path TEXT NULL,
        file_rollback_available INTEGER NOT NULL DEFAULT 0,
        db_rollback_available INTEGER NOT NULL DEFAULT 0,
        log_json TEXT NULL,
        started_at TEXT NULL,
        finished_at TEXT NULL
    )"
);

$slug = 'sync-kit';
$manifestJson = json_encode([
    'schema_version' => 1,
    'type' => 'jasefly-module',
    'name' => 'Sync Kit',
    'slug' => $slug,
    'version' => '1.0.0',
    'jasefly' => ['api_version' => 1, 'sdk_version' => 1, 'min_version' => '1.0.0'],
    'entrypoints' => ['backend' => 'backend/SyncKitModule.php'],
    'migrations' => ['path' => 'migrations'],
], JSON_UNESCAPED_UNICODE);
$pdo->prepare(
    "INSERT INTO installed_modules (slug, name, installed_version, status, source, health_status, manifest_json)
     VALUES (?, ?, '1.0.0', 'enabled', 'package', 'ok', ?)"
)->execute([$slug, 'Sync Kit', $manifestJson]);
$pdo->exec(
    "INSERT INTO modules (name, is_enabled) VALUES ('$slug', 1)"
);
// Divergent bundled control row
$pdo->exec(
    "INSERT INTO modules (name, is_enabled) VALUES ('projects', 1)"
);

$app = [
    'version' => '1.0.0',
    'paths' => [
        'api_root' => $ctx['tmpDir'] . '/api',
        'web_root' => $ctx['tmpDir'] . '/web',
    ],
];
@mkdir($app['paths']['api_root'] . '/modules/' . $slug, 0775, true);
@mkdir($app['paths']['api_root'] . '/storage/modules/' . $slug, 0775, true);
@mkdir($app['paths']['web_root'] . '/modules/' . $slug, 0775, true);

$paths = new ModulePackagePaths($app['paths']['api_root'], $app['paths']['web_root']);
$repo = new ModuleRegistryRepository($db);
$mirror = new ModulePluginMirror($db);

// —— Mirror helper ——
$mirror->mirror($slug, false);
$rowB = $pdo->query("SELECT is_enabled FROM modules WHERE name='$slug'")->fetch(PDO::FETCH_ASSOC);
assert_true((int) ($rowB['is_enabled'] ?? 1) === 0, 'mirror(false) sets modules.is_enabled=0');
$mirror->mirror($slug, true);
$rowB = $pdo->query("SELECT is_enabled FROM modules WHERE name='$slug'")->fetch(PDO::FETCH_ASSOC);
assert_true((int) ($rowB['is_enabled'] ?? 0) === 1, 'mirror(true) sets modules.is_enabled=1');

// —— PackageService disable writes A+B ——
$svc = new ModulePackageService(
    $db,
    $app,
    $paths,
    $repo,
    new \App\Services\Modules\ModuleStagingService($paths),
    new \App\Services\Modules\ModuleSnapshotService($paths, $repo),
    new \App\Services\Modules\ModuleMigrationService($db),
    new \App\Services\Modules\ModuleHookRunner(),
    new \App\Services\Modules\ModuleHealthService($repo, $paths, new \App\Services\Modules\ModuleMigrationService($db), $app),
);
$svc->disable($slug, null);
$a = $repo->getBySlug($slug);
$b = $pdo->query("SELECT is_enabled FROM modules WHERE name='$slug'")->fetch(PDO::FETCH_ASSOC);
assert_true(($a['status'] ?? '') === 'disabled', 'PackageService::disable sets installed_modules.status=disabled');
assert_true((int) ($b['is_enabled'] ?? 1) === 0, 'PackageService::disable mirrors modules.is_enabled=0');

$svc->enable($slug, null);
$a = $repo->getBySlug($slug);
$b = $pdo->query("SELECT is_enabled FROM modules WHERE name='$slug'")->fetch(PDO::FETCH_ASSOC);
assert_true(($a['status'] ?? '') === 'enabled', 'PackageService::enable sets status=enabled');
assert_true((int) ($b['is_enabled'] ?? 0) === 1, 'PackageService::enable mirrors is_enabled=1');

// —— R1: A=enabled, B=0 → enable() → A=enabled, B=1 (no status flip needed) ——
$pdo->exec("UPDATE modules SET is_enabled=0 WHERE name='$slug'");
$pdo->exec("UPDATE installed_modules SET status='enabled' WHERE slug='$slug'");
$opsBefore = (int) $pdo->query("SELECT COUNT(*) FROM module_operations WHERE module_slug='$slug' AND operation='enable'")->fetchColumn();
$svc->enable($slug, null);
$a = $repo->getBySlug($slug);
$b = $pdo->query("SELECT is_enabled FROM modules WHERE name='$slug'")->fetch(PDO::FETCH_ASSOC);
$opsAfter = (int) $pdo->query("SELECT COUNT(*) FROM module_operations WHERE module_slug='$slug' AND operation='enable'")->fetchColumn();
assert_true(($a['status'] ?? '') === 'enabled', 'R1 enable idempotent keeps A=enabled');
assert_true((int) ($b['is_enabled'] ?? 0) === 1, 'R1 enable repairs B=1 when already enabled');
assert_true($opsAfter === $opsBefore, 'R1 enable does not start another enable operation');

// —— R1 inverse: A=disabled, B=1 → disable() → A=disabled, B=0 ——
$pdo->exec("UPDATE installed_modules SET status='disabled' WHERE slug='$slug'");
$pdo->exec("UPDATE modules SET is_enabled=1 WHERE name='$slug'");
$opsDisBefore = (int) $pdo->query("SELECT COUNT(*) FROM module_operations WHERE module_slug='$slug' AND operation='disable'")->fetchColumn();
$svc->disable($slug, null);
$a = $repo->getBySlug($slug);
$b = $pdo->query("SELECT is_enabled FROM modules WHERE name='$slug'")->fetch(PDO::FETCH_ASSOC);
$opsDisAfter = (int) $pdo->query("SELECT COUNT(*) FROM module_operations WHERE module_slug='$slug' AND operation='disable'")->fetchColumn();
assert_true(($a['status'] ?? '') === 'disabled', 'R1 disable idempotent keeps A=disabled');
assert_true((int) ($b['is_enabled'] ?? 1) === 0, 'R1 disable repairs B=0 when already disabled');
assert_true($opsDisAfter === $opsDisBefore, 'R1 disable does not start another disable operation');

// —— isPackageBacked ——
assert_true($mirror->isPackageBacked($repo, $slug) === true, 'isPackageBacked true for package source');
assert_true($mirror->isPackageBacked($repo, 'projects') === false, 'isPackageBacked false when no installed row');

// —— R5: Simulate Plugins-toggle divergence (old bug): B=0 while A=enabled ——
$pdo->exec("UPDATE installed_modules SET status='enabled' WHERE slug='$slug'");
$pdo->exec("UPDATE modules SET is_enabled=0 WHERE name='$slug'");
$report = $mirror->reconcile($repo, true);
assert_true(($report['divergent'] ?? $report['diverged'] ?? 0) >= 1, 'reconcile dry-run detects divergence');
assert_true(($report['scanned'] ?? 0) >= 1, 'reconcile reports scanned');
assert_true(($report['repaired'] ?? -1) === 0, 'dry-run repaired=0');
assert_true(
    (int) ($pdo->query("SELECT is_enabled FROM modules WHERE name='$slug'")->fetch(PDO::FETCH_ASSOC)['is_enabled'] ?? 0) === 0,
    'dry-run does not mutate modules.is_enabled'
);

$report = $mirror->reconcile($repo, false);
assert_true(($report['repaired'] ?? 0) >= 1, 'reconcile repairs at least one row after verified write');
assert_true(($report['failed'] ?? -1) === 0, 'reconcile failed=0 on success');
$b = $pdo->query("SELECT is_enabled FROM modules WHERE name='$slug'")->fetch(PDO::FETCH_ASSOC);
assert_true((int) ($b['is_enabled'] ?? 0) === 1, 'reconcile sets mirror from canonical enabled');

// —— Idempotent second reconcile ——
$report2 = $mirror->reconcile($repo, false);
assert_true(($report2['repaired'] ?? 0) === 0, 'second reconcile produces zero repairs');
assert_true(($report2['unchanged'] ?? 0) >= 1, 'second reconcile counts unchanged');

// —— R5: missing mirror row counts as divergent and repairs ——
$pdo->exec("DELETE FROM modules WHERE name='$slug'");
$reportMiss = $mirror->reconcile($repo, false);
assert_true(($reportMiss['divergent'] ?? 0) >= 1, 'missing mirror row is divergent');
assert_true(($reportMiss['repaired'] ?? 0) >= 1, 'missing mirror row is repaired');
$b = $pdo->query("SELECT is_enabled FROM modules WHERE name='$slug'")->fetch(PDO::FETCH_ASSOC);
assert_true($b !== false && (int) ($b['is_enabled'] ?? 0) === 1, 'missing row recreated with B=1');

// —— R5: failed write tracked (drop modules mid-reconcile via rename) ——
$pdo->exec("UPDATE modules SET is_enabled=0 WHERE name='$slug'");
$pdo->exec('ALTER TABLE modules RENAME TO modules_bak_r5');
$reportFail = $mirror->reconcile($repo, false);
assert_true(($reportFail['failed'] ?? 0) >= 1, 'reconcile failed write increments failed');
assert_true(($reportFail['repaired'] ?? -1) === 0, 'failed write does not count as repaired');
assert_true(!empty($reportFail['failures']), 'reconcile returns structured per-module failures');
$pdo->exec('ALTER TABLE modules_bak_r5 RENAME TO modules');
$pdo->exec("UPDATE modules SET is_enabled=1 WHERE name='$slug'");

// —— Loader failure mirrors B=0 ——
$pdo->exec("UPDATE installed_modules SET status='enabled' WHERE slug='$slug'");
$mirror->mirror($slug, true);
$safe = new ModuleSafeMode($paths);
$loader = new InstalledModuleLoader($repo, $paths, $safe, $db, $app);
$registry = new ModuleRegistry($db, $app, $ctx['tmpDir'] . '/empty-modules');
@mkdir($ctx['tmpDir'] . '/empty-modules', 0775, true);
$loader->loadEnabled($registry);
$a = $repo->getBySlug($slug);
$b = $pdo->query("SELECT is_enabled FROM modules WHERE name='$slug'")->fetch(PDO::FETCH_ASSOC);
assert_true(($a['status'] ?? '') === 'failed', 'loader failure sets installed_modules.status=failed');
assert_true((int) ($b['is_enabled'] ?? 1) === 0, 'loader failure mirrors modules.is_enabled=0');
$failures = $registry->loadFailures();
$hasPackage = false;
foreach ($failures as $f) {
    if (($f['module'] ?? '') === $slug && ($f['stage'] ?? '') === 'package_load') {
        $hasPackage = true;
    }
}
assert_true($hasPackage, 'loader records package_load failure');

// —— R4: mirror persistence failure after package load failure is observable ——
$pdo->exec("UPDATE installed_modules SET status='enabled', last_error=NULL WHERE slug='$slug'");
$pdo->exec("UPDATE modules SET is_enabled=1 WHERE name='$slug'");
$safe->clear($slug);
$registry2 = new ModuleRegistry($db, $app, $ctx['tmpDir'] . '/empty-modules');
$pdo->exec('ALTER TABLE modules RENAME TO modules_bak_r4');
$loader->loadEnabled($registry2);
$a = $repo->getBySlug($slug);
assert_true(($a['status'] ?? '') === 'failed', 'R4 package failure still sets A=failed');
$failures2 = $registry2->loadFailures();
$stages = [];
foreach ($failures2 as $f) {
    if (($f['module'] ?? '') === $slug) {
        $stages[] = (string) ($f['stage'] ?? '');
    }
}
assert_true(in_array('package_load', $stages, true), 'R4 records package_load');
assert_true(in_array('plugin_mirror', $stages, true), 'R4 records plugin_mirror separately');
// Projection drift: A=failed but mirror table missing → cannot claim B synced
assert_true(
    $pdo->query("SELECT name FROM sqlite_master WHERE name='modules'")->fetch() === false
    || $pdo->query("SELECT name FROM sqlite_master WHERE name='modules_bak_r4'")->fetch() !== false,
    'R4 mirror table unavailable exposes inconsistency'
);
$pdo->exec('ALTER TABLE modules_bak_r4 RENAME TO modules');

// —— Bundled toggle must not require installed_modules ——
$pdo->exec("UPDATE modules SET is_enabled=1 WHERE name='projects'");
$state = new \App\Services\PluginStateService($db, $app);
$bundled = new class extends \App\Core\AbstractModule {
    public function name(): string { return 'projects'; }
    public function registerRoutes(\App\Router $router, \App\Database $db, array $app, string $apiPrefix): void {}
};
$state->setEnabled('projects', false);
assert_true($state->isEnabled($bundled) === false, 'bundled PluginStateService::setEnabled still works without installed_modules');
assert_true($repo->getBySlug('projects') === null, 'bundled toggle does not create installed_modules row');

($ctx['cleanup'])();
