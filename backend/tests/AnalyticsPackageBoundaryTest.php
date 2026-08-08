<?php
declare(strict_types=1);

/**
 * Module boundary: analytics is a ZIP package (scheduler + host slots, no core hardcodes).
 * Included from run.php (uses global assert_true).
 */

use App\Core\AbstractModule;
use App\Core\ModuleRegistry;
use App\Core\Modules\ModuleManifest;
use App\Core\Modules\PackageModuleAdapter;
use App\Database;
use App\Modules\Scheduler\JobHandlerRegistry;
use App\Platform\Adapters\SchedulerAdapter;
use App\Router;

$repoRoot = dirname(__DIR__, 2);
assert_true(!is_dir(dirname(__DIR__) . '/src/Modules/Analytics'), 'bundled Modules/Analytics removed from discovery');
assert_true(!is_dir($repoRoot . '/backend/legacy-extract/Analytics'), 'legacy Analytics removed after live verify');
assert_true(!empty(glob($repoRoot . '/release/modules/jasefly-module-analytics-*.zip')), 'analytics ZIP present');

$pkgDir = $repoRoot . '/modules-src/analytics';
if (!is_dir($pkgDir)) {
    $pkgDir = dirname(__DIR__) . '/tests/fixtures/modules/analytics';
}
assert_true(is_dir($pkgDir), 'analytics package directory exists');
assert_true(is_file($pkgDir . '/module.json'), 'analytics module.json exists');
assert_true(is_file($pkgDir . '/backend/AnalyticsModule.php'), 'analytics backend entry exists');
assert_true(is_file($pkgDir . '/backend/AnalyticsService.php'), 'analytics service exists');

$mf = json_decode((string) file_get_contents($pkgDir . '/module.json'), true);
assert_true(is_array($mf) && ($mf['slug'] ?? '') === 'analytics', 'analytics slug is analytics');
assert_true(($mf['dependencies']['required']['system'] ?? '') !== '', 'analytics requires system');
assert_true(in_array('scheduler.jobs', $mf['capabilities']['requires'] ?? [], true), 'analytics requires scheduler.jobs');

$phpFiles = glob($pkgDir . '/backend/*.php') ?: [];
$forbidden = false;
$usesJobRegistry = false;
foreach ($phpFiles as $file) {
    $src = (string) file_get_contents($file);
    if (preg_match('/App\\\\(Core|Services|Modules|Controllers)\\\\/', $src) === 1) {
        $forbidden = true;
        break;
    }
    if (str_contains($src, 'JobHandlerRegistry')) {
        $usesJobRegistry = true;
    }
}
assert_true(!$forbidden, 'analytics package has no Core/Services/Modules/Controllers imports');
assert_true(!$usesJobRegistry, 'analytics package does not use JobHandlerRegistry directly');

$modSrc = (string) file_get_contents($pkgDir . '/backend/AnalyticsModule.php');
assert_true(str_contains($modSrc, 'AbstractPackageModule'), 'analytics extends AbstractPackageModule');
assert_true(str_contains($modSrc, "registerHandler('retention'"), 'registers local retention job');
assert_true(str_contains($modSrc, "registerHandler('aggregate'"), 'registers local aggregate job');
assert_true(str_contains($modSrc, 'scheduleCron'), 'schedules package crons via scheduler API');
assert_true(str_contains($modSrc, '/analytics/collect'), 'public collect route present');
assert_true(
    substr_count($modSrc, 'analytics.view') + substr_count($modSrc, 'analytics.manage') >= 2,
    'analytics permissions wired'
);

$schedModule = (string) file_get_contents(dirname(__DIR__) . '/src/Modules/Scheduler/SchedulerModule.php');
$schedRegistry = (string) file_get_contents(dirname(__DIR__) . '/src/Modules/Scheduler/JobHandlerRegistry.php');
assert_true(!str_contains($schedModule, 'analytics.'), 'SchedulerModule has no analytics slug refs');
assert_true(!str_contains($schedRegistry, 'analytics.'), 'JobHandlerRegistry has no analytics slug refs');

$fe = (string) file_get_contents($pkgDir . '/frontend-dist/index.js');
assert_true(str_contains($fe, 'hostPageKey'), 'FE binds host admin page via hostPageKey');
assert_true(str_contains($fe, 'analytics.admin'), 'hostPageKey analytics.admin present');
assert_true(str_contains($fe, "registerSlot") || str_contains($fe, 'registerSlot('), 'FE registers host slot');
assert_true(str_contains($fe, 'site.body.end'), 'FE mounts beacon on site.body.end');
assert_true(str_contains($fe, 'requiresConsentCategory'), 'FE uses consent category option');
assert_true(str_contains($fe, 'admin.dashboard'), 'FE mounts dashboard card on admin.dashboard');

$mainTsx = (string) file_get_contents($repoRoot . '/frontend/src/main.tsx');
assert_true(!preg_match("/import\\s+['\"]@\\/modules\\/analytics['\"]/", $mainTsx), 'host main has no static analytics module import');
assert_true(str_contains($mainTsx, "provideHostAdminPage('analytics.admin'"), 'host provides analytics.admin page');

$siteLayout = (string) file_get_contents($repoRoot . '/frontend/src/components/layout/SiteLayout.tsx');
assert_true(!str_contains($siteLayout, 'AnalyticsBeacon'), 'SiteLayout does not import AnalyticsBeacon');
assert_true(str_contains($siteLayout, 'HostSlot'), 'SiteLayout mounts HostSlot');
assert_true(str_contains($siteLayout, 'site.body.end'), 'SiteLayout uses site.body.end slot');

$hostSlots = (string) file_get_contents($repoRoot . '/frontend/src/platform/hostSlots.ts');
assert_true(str_contains($hostSlots, 'site.body.end'), 'hostSlots defines site.body.end');
assert_true(str_contains($hostSlots, 'admin.dashboard'), 'hostSlots defines admin.dashboard');
assert_true(str_contains($hostSlots, 'requiresConsentCategory'), 'hostSlots supports consent gate');

$consentBridge = (string) file_get_contents($repoRoot . '/frontend/src/platform/consentBridge.ts');
assert_true(str_contains($consentBridge, 'allowsConsentCategory'), 'consentBridge exposes category API');

$dashShell = (string) file_get_contents($repoRoot . '/frontend/src/admin/dashboard/DashboardShell.tsx');
assert_true(str_contains($dashShell, "HostSlot"), 'DashboardShell mounts HostSlot');
assert_true(str_contains($dashShell, 'admin.dashboard'), 'DashboardShell uses admin.dashboard');
assert_true(!str_contains($dashShell, "usePluginEnabled('analytics')"), 'DashboardShell has no analytics plugin hardcode');

$mig = (string) file_get_contents($pkgDir . '/migrations/001_analytics.sql');
assert_true(str_contains($mig, 'CREATE TABLE IF NOT EXISTS'), 'migration is non-destructive IF NOT EXISTS');
assert_true(str_contains($mig, 'analytics_events'), 'migration targets analytics_events');
assert_true(str_contains($mig, 'analytics_sessions'), 'migration targets analytics_sessions');

// вЂ”вЂ” Package wins over same-slug bundled вЂ”вЂ”
if (!extension_loaded('pdo_sqlite')) {
    echo "  SKIP analytics runtime boundary (pdo_sqlite missing)\n";
    return;
}

require_once __DIR__ . '/helpers.php';
$ctx = jasefly_test_sqlite_boot();
$db = $ctx['db'];
$pdo = $ctx['pdo'];
$pdo->exec(
    "CREATE TABLE IF NOT EXISTS modules (
        name TEXT PRIMARY KEY,
        is_enabled INTEGER NOT NULL DEFAULT 1,
        settings TEXT NULL
    )"
);
$pdo->exec("INSERT INTO modules (name, is_enabled) VALUES ('analytics', 1)");

// Pre-existing tables (adoption): package migration must not wipe data.
$pdo->exec(
    "CREATE TABLE IF NOT EXISTS analytics_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        event_name TEXT NOT NULL,
        visitor_hash TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )"
);
$pdo->exec("INSERT INTO analytics_events (event_name, visitor_hash) VALUES ('page_view', 'adopt-me')");
$before = (int) ($pdo->query('SELECT COUNT(*) FROM analytics_events')->fetchColumn() ?: 0);
assert_true($before >= 1, 'pre-existing analytics row present for adoption');

$app = array_merge($ctx['app'] ?? [], [
    'modules' => ['disabled' => []],
    'jwt_secret' => 'test-secret-analytics-boundary',
]);

$registryPath = sys_get_temp_dir() . '/jasefly-analytics-empty-' . getmypid();
@mkdir($registryPath, 0775, true);
$registry = new ModuleRegistry($db, $app, $registryPath);

$bundledStub = new class extends AbstractModule {
    public function name(): string { return 'analytics'; }
    public function label(): string { return 'Analytics Bundled Stub'; }
    public function registerRoutes(Router $router, Database $db, array $app, string $apiPrefix): void {}
};
$registry->register($bundledStub);

$manifest = ModuleManifest::fromArray([
    'schema_version' => 1,
    'type' => 'jasefly-module',
    'name' => 'Analytics',
    'slug' => 'analytics',
    'version' => '1.0.0',
    'jasefly' => ['api_version' => 1, 'sdk_version' => 1, 'min_version' => '1.0.0'],
    'entrypoints' => ['backend' => 'backend/AnalyticsModule.php'],
    'dependencies' => ['required' => ['system' => '>=1.0.0']],
    'capabilities' => [
        'requires' => ['api.routes', 'admin.pages', 'permissions.check', 'scheduler.jobs'],
        'provides' => ['analytics.collect', 'analytics.admin'],
    ],
]);

require_once $pkgDir . '/backend/AnalyticsService.php';
require_once $pkgDir . '/backend/AnalyticsModule.php';
$inner = new \App\PackageModules\Analytics\AnalyticsModule();
$inner->setPackageManifest($manifest);
$registry->register(new PackageModuleAdapter($inner, $manifest));

$found = null;
foreach ($registry->all() as $mod) {
    if ($mod->name() === 'analytics') {
        $found = $mod;
        break;
    }
}
assert_true($found instanceof PackageModuleAdapter, 'package adapter replaces bundled same slug');
assert_true(in_array($found->label(), ['Analytics', 'Аналитика'], true), 'winning module is package label');

// Scheduler ownership: local names в†’ analytics.*
JobHandlerRegistry::resetForTests();
$sched = new SchedulerAdapter($db, 'analytics');
$sched->registerHandler('retention', static function (): array { return ['ok' => true]; });
$sched->registerHandler('aggregate', static function (): int { return 1; });
assert_true(JobHandlerRegistry::has('analytics.retention'), 'retention resolves to analytics.retention');
assert_true(JobHandlerRegistry::has('analytics.aggregate'), 'aggregate resolves to analytics.aggregate');
assert_true(JobHandlerRegistry::ownerOf('analytics.retention') === 'analytics', 'retention owned by analytics');
assert_true(JobHandlerRegistry::ownerOf('analytics.aggregate') === 'analytics', 'aggregate owned by analytics');

// Disable/release: handlers gone, no duplicates on re-register
$sched->releasePackage();
assert_true(!JobHandlerRegistry::has('analytics.retention'), 'release unregisters retention');
assert_true(!JobHandlerRegistry::has('analytics.aggregate'), 'release unregisters aggregate');
$sched->registerHandler('retention', static function (): array { return ['ok' => true]; });
$sched->registerHandler('aggregate', static function (): int { return 1; });
assert_true(JobHandlerRegistry::has('analytics.retention'), 're-enable restores retention without requiring global core register');
$types = JobHandlerRegistry::types();
$retCount = count(array_filter($types, static fn($t) => $t === 'analytics.retention'));
assert_true($retCount === 1, 'no duplicate analytics.retention handlers');

$after = (int) ($pdo->query('SELECT COUNT(*) FROM analytics_events')->fetchColumn() ?: 0);
assert_true($after === $before, 'existing analytics tables/data preserved (adoption)');

$emptyReg = new ModuleRegistry($db, $app, $registryPath);
$emptyReg->discover();
$hasAnalytics = false;
foreach ($emptyReg->all() as $mod) {
    if ($mod->name() === 'analytics') {
        $hasAnalytics = true;
    }
}
assert_true($hasAnalytics === false, 'clean discover without Modules/Analytics has no analytics');

($ctx['cleanup'])();
