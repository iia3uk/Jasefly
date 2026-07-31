<?php
declare(strict_types=1);

/**
 * Regression: a deliberately broken ZIP package must never take down core boot.
 * Covers: compile-footgun preflight, bootPlatform throw, quarantine metadata, disable recovery.
 */

use App\Core\ModuleRegistry;
use App\Core\Modules\ModulePackagePaths;
use App\Router;
use App\Services\Modules\InstalledModuleLoader;
use App\Services\Modules\ModulePackageService;
use App\Services\Modules\ModulePluginMirror;
use App\Services\Modules\ModuleRegistryRepository;
use App\Services\Modules\ModuleSafeMode;

if (!extension_loaded('pdo_sqlite')) {
    echo "  SKIP ModuleQuarantineIsolation (pdo_sqlite missing)\n";
    return;
}

require_once __DIR__ . '/helpers.php';

$ctx = jasefly_test_sqlite_boot();
$pdo = $ctx['pdo'];
$db = $ctx['db'];

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

$apiRoot = $ctx['tmpDir'] . '/api';
$webRoot = $ctx['tmpDir'] . '/web';
@mkdir($apiRoot . '/modules', 0775, true);
@mkdir($apiRoot . '/storage', 0775, true);
@mkdir($webRoot . '/modules', 0775, true);

$app = [
    'version' => '1.0.0',
    'paths' => [
        'api_root' => $apiRoot,
        'web_root' => $webRoot,
    ],
    'api' => ['versions' => ['/api/v1']],
];

$paths = new ModulePackagePaths($apiRoot, $webRoot);
$repo = new ModuleRegistryRepository($db);
$safe = new ModuleSafeMode($paths);

$writeModule = static function (
    string $slug,
    string $studly,
    string $phpBody,
    string $className,
) use ($apiRoot, $pdo): void {
    $root = $apiRoot . '/modules/' . $slug . '/backend';
    @mkdir($root, 0775, true);
    file_put_contents($root . '/' . $className . '.php', $phpBody);
    $manifest = json_encode([
        'schema_version' => 1,
        'type' => 'jasefly-module',
        'name' => $studly,
        'slug' => $slug,
        'version' => '1.0.0',
        'jasefly' => ['api_version' => 1, 'sdk_version' => 1, 'min_version' => '1.0.0'],
        'entrypoints' => ['backend' => 'backend/' . $className . '.php'],
        'migrations' => ['path' => 'migrations'],
    ], JSON_UNESCAPED_UNICODE);
    $pdo->prepare(
        "INSERT INTO installed_modules (slug, name, installed_version, status, source, health_status, manifest_json)
         VALUES (?, ?, '1.0.0', 'enabled', 'package', 'unknown', ?)"
    )->execute([$slug, $studly, $manifest]);
    $pdo->prepare("INSERT INTO modules (name, is_enabled) VALUES (?, 1)")->execute([$slug]);
};

// —— A: compile-fatal footgun (static settings) — preflight must quarantine ——
$slugA = 'boom-settings';
$writeModule(
    $slugA,
    'BoomSettings',
    <<<'PHP'
<?php
declare(strict_types=1);
namespace App\PackageModules\BoomSettings;
use App\Platform\Package\AbstractPackageModule;
use App\Platform\PlatformContext;
final class BoomSettingsModule extends AbstractPackageModule {
    public function name(): string { return 'boom-settings'; }
    public function label(): string { return 'Boom Settings'; }
    public function bootPlatform(PlatformContext $ctx): void {}
    private static function settings(): array { return []; }
}
PHP,
    'BoomSettingsModule'
);

// —— B: throws during bootPlatform / registerRoutes ——
$slugB = 'boom-boot';
$writeModule(
    $slugB,
    'BoomBoot',
    <<<'PHP'
<?php
declare(strict_types=1);
namespace App\PackageModules\BoomBoot;
use App\Platform\Package\AbstractPackageModule;
use App\Platform\PlatformContext;
final class BoomBootModule extends AbstractPackageModule {
    public function name(): string { return 'boom-boot'; }
    public function label(): string { return 'Boom Boot'; }
    public function bootPlatform(PlatformContext $ctx): void {
        throw new \RuntimeException('intentional bootPlatform boom');
    }
}
PHP,
    'BoomBootModule'
);

$registry = new ModuleRegistry($db, $app, $apiRoot . '/bundled-empty');
@mkdir($apiRoot . '/bundled-empty', 0775, true);
$loader = new InstalledModuleLoader($repo, $paths, $safe, $db, $app);

$threw = false;
try {
    $loader->loadEnabled($registry);
    $registry->boot();
    $router = new Router();
    $registry->registerRoutes($router, '/api/v1');
} catch (\Throwable $e) {
    $threw = true;
    echo '  UNEXPECTED throw: ' . $e->getMessage() . "\n";
}
assert_true($threw === false, 'broken packages must not throw out of load/boot/registerRoutes');

$rowA = $repo->getBySlug($slugA);
assert_true(($rowA['status'] ?? '') === 'failed', 'boom-settings status=failed');
assert_true(($rowA['health_status'] ?? '') === 'quarantined', 'boom-settings health=quarantined');
assert_true(is_string($rowA['last_error'] ?? null) && $rowA['last_error'] !== '', 'boom-settings last_error set');
assert_true(str_contains((string) $rowA['last_error'], 'settings'), 'boom-settings error mentions settings');

$entryA = $safe->entry($slugA);
assert_true($entryA !== null, 'boom-settings safe-mode entry exists');
assert_true(($entryA['stage'] ?? '') === 'package_load', 'boom-settings stage=package_load');
assert_true(($entryA['at'] ?? '') !== '', 'boom-settings quarantine time set');
assert_true(($entryA['class'] ?? '') !== '' || str_contains((string) ($entryA['error'] ?? ''), 'settings'), 'boom-settings class or error recorded');

$rowB = $repo->getBySlug($slugB);
assert_true(($rowB['status'] ?? '') === 'failed', 'boom-boot status=failed after registerRoutes');
assert_true(($rowB['health_status'] ?? '') === 'quarantined', 'boom-boot health=quarantined');
assert_true(str_contains((string) ($rowB['last_error'] ?? ''), 'bootPlatform'), 'boom-boot error mentions bootPlatform');

$entryB = $safe->entry($slugB);
assert_true($entryB !== null, 'boom-boot safe-mode entry exists');
assert_true(($entryB['class'] ?? '') !== '', 'boom-boot stores exception class');
assert_true(($entryB['file'] ?? null) !== null, 'boom-boot stores file');
assert_true(($entryB['at'] ?? '') !== '', 'boom-boot stores time');

assert_true($registry->get($slugA) === null, 'quarantined boom-settings unregistered');
assert_true($registry->get($slugB) === null, 'quarantined boom-boot unregistered');

$failures = $registry->loadFailures();
assert_true(count($failures) >= 2, 'loadFailures records both packages');

$mirrorA = $pdo->query("SELECT is_enabled FROM modules WHERE name='$slugA'")->fetch(PDO::FETCH_ASSOC);
$mirrorB = $pdo->query("SELECT is_enabled FROM modules WHERE name='$slugB'")->fetch(PDO::FETCH_ASSOC);
assert_true((int) ($mirrorA['is_enabled'] ?? 1) === 0, 'boom-settings mirror disabled');
assert_true((int) ($mirrorB['is_enabled'] ?? 1) === 0, 'boom-boot mirror disabled');

// —— Recovery: disable quarantined module must succeed ——
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

$dis = $svc->disable($slugA, null);
assert_true(($dis['ok'] ?? false) === true, 'disable quarantined boom-settings ok');
$rowA2 = $repo->getBySlug($slugA);
assert_true(($rowA2['status'] ?? '') === 'disabled', 'boom-settings status=disabled after recovery');
assert_true($safe->isSkipped($slugA) === false, 'safe-mode cleared after disable');

// Second boot with remaining boom-boot still quarantined — core still OK
$registry2 = new ModuleRegistry($db, $app, $apiRoot . '/bundled-empty');
$loader2 = new InstalledModuleLoader($repo, $paths, new ModuleSafeMode($paths), $db, $app);
$threw2 = false;
try {
    $loader2->loadEnabled($registry2);
    $registry2->boot();
    $registry2->registerRoutes(new Router(), '/api/v1');
} catch (\Throwable $e) {
    $threw2 = true;
}
assert_true($threw2 === false, 'second boot still isolated with boom-boot quarantined');

echo "  ModuleQuarantineIsolation OK\n";
