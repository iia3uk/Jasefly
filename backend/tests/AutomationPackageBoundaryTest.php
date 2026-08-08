<?php
declare(strict_types=1);

require_once __DIR__ . '/_package_dir.php';

/**
 * Module boundary: automation is a ZIP package (EventCatalog discovery, Scheduler resume).
 * Included from run.php (uses global assert_true).
 */

use App\Core\AbstractModule;
use App\Core\EventDispatcher;
use App\Core\ModuleRegistry;
use App\Core\Modules\ModuleManifest;
use App\Core\Modules\PackageModuleAdapter;
use App\Database;
use App\Modules\Scheduler\JobHandlerRegistry;
use App\Platform\Adapters\EventsAdapter;
use App\Platform\Adapters\SchedulerAdapter;
use App\Platform\Events\EventCatalog;
use App\Router;

$repoRoot = dirname(__DIR__, 2);
assert_true(!is_dir(dirname(__DIR__) . '/src/Modules/Automation'), 'bundled Modules/Automation removed from discovery');
assert_true(!is_dir($repoRoot . '/backend/legacy-extract/Automation'), 'legacy Automation removed after live verify');
jasefly_test_assert_package_identity('automation', $repoRoot);

$pkgDir = jasefly_test_package_dir('automation');
assert_true($pkgDir !== null, 'automation package directory exists');
assert_true(is_dir($pkgDir), 'automation package directory exists');
assert_true(is_file($pkgDir . '/module.json'), 'automation module.json exists');
assert_true(is_file($pkgDir . '/backend/AutomationModule.php'), 'automation backend entry exists');
assert_true(is_file($pkgDir . '/backend/AutomationEngine.php'), 'automation engine exists');
assert_true(is_file($pkgDir . '/backend/FormsSubmissionCompatAction.php'), 'forms compat action isolated');

$mf = json_decode((string) file_get_contents($pkgDir . '/module.json'), true);
assert_true(is_array($mf) && ($mf['slug'] ?? '') === 'automation', 'automation slug is automation');
assert_true(($mf['dependencies']['required']['system'] ?? '') !== '', 'automation requires system');
assert_true(in_array('scheduler.jobs', $mf['capabilities']['requires'] ?? [], true), 'automation requires scheduler.jobs');
assert_true(in_array('events.subscribe', $mf['capabilities']['requires'] ?? [], true), 'automation requires events.subscribe');

$phpFiles = glob($pkgDir . '/backend/*.php') ?: [];
$forbidden = false;
$usesJobRegistry = false;
$usesJobQueue = false;
$usesConcreteMailer = false;
$usesEventCatalogDirect = false;
foreach ($phpFiles as $file) {
    $src = (string) file_get_contents($file);
    if (preg_match('/App\\\\(Core|Services|Modules|Controllers)\\\\/', $src) === 1) {
        $forbidden = true;
        break;
    }
    if (preg_match('/(?:use\\s+.*?JobHandlerRegistry|JobHandlerRegistry::)/', $src) === 1) {
        $usesJobRegistry = true;
    }
    if (preg_match('/(?:use\\s+.*?JobQueue|JobQueue::)/', $src) === 1) {
        $usesJobQueue = true;
    }
    if (preg_match('/(?:use\\s+.*?Mail\\\\Mailer|Modules\\\\Mail\\\\Mailer)/', $src) === 1) {
        $usesConcreteMailer = true;
    }
    if (preg_match('/(?:use\\s+.*?EventCatalog|EventCatalog::)/', $src) === 1) {
        $usesEventCatalogDirect = true;
    }
}
assert_true(!$forbidden, 'automation package has no Core/Services/Modules/Controllers imports');
assert_true(!$usesJobRegistry, 'automation package does not use JobHandlerRegistry directly');
assert_true(!$usesJobQueue, 'automation package does not use JobQueue directly');
assert_true(!$usesConcreteMailer, 'automation package does not depend on concrete Mailer');
assert_true(!$usesEventCatalogDirect, 'automation uses Platform events API, not EventCatalog class');

$modSrc = (string) file_get_contents($pkgDir . '/backend/AutomationModule.php');
assert_true(str_contains($modSrc, 'AbstractPackageModule'), 'automation extends AbstractPackageModule');
assert_true(str_contains($modSrc, "registerHandler('resume'"), 'registers local resume job');
assert_true(str_contains($modSrc, "subscribe('*'") || str_contains($modSrc, 'subscribe("*'), 'subscribes wildcard for discovery runtime');
assert_true(str_contains($modSrc, 'listDeclared') && str_contains($modSrc, 'hasDeclared'), 'triggers API uses listDeclared/hasDeclared');
assert_true(str_contains($modSrc, "/admin/automations/triggers"), 'exposes triggers discovery route');
assert_true(!preg_match('/const\\s+EVENTS\\s*=/', $modSrc), 'no hardcoded EVENTS whitelist constant');
assert_true(!str_contains($modSrc, 'form.submitted'), 'module source has no product form.submitted whitelist');

$engineSrc = (string) file_get_contents($pkgDir . '/backend/AutomationEngine.php');
assert_true(str_contains($engineSrc, 'PlatformMailInterface'), 'engine uses Platform Mail');
assert_true(str_contains($engineSrc, 'PlatformSchedulerInterface'), 'engine uses Platform Scheduler');
assert_true(str_contains($engineSrc, 'PlatformHttpInterface'), 'engine uses Platform HTTP');
assert_true(str_contains($engineSrc, 'PlatformNotificationsInterface'), 'engine uses Platform Notifications');
assert_true(
    (bool) preg_match("/enqueueEx\\s*\\(\\s*'resume'/", $engineSrc),
    'delay enqueues local resume'
);
assert_true(str_contains($engineSrc, 'registerCompatAction') || str_contains($modSrc, 'registerCompatAction'), 'compat actions supported');
assert_true(!str_contains($engineSrc, 'form_submissions'), 'generic engine has no form_submissions SQL');

$compatSrc = (string) file_get_contents($pkgDir . '/backend/FormsSubmissionCompatAction.php');
assert_true(str_contains($compatSrc, 'form_submissions'), 'compat action owns Forms SQL');
assert_true(str_contains($compatSrc, 'TECHNICAL DEBT') || str_contains($compatSrc, 'tech debt') || str_contains($compatSrc, 'compatibility'), 'compat marked as debt');

$schedModule = (string) file_get_contents(dirname(__DIR__) . '/src/Modules/Scheduler/SchedulerModule.php');
$schedRegistry = (string) file_get_contents(dirname(__DIR__) . '/src/Modules/Scheduler/JobHandlerRegistry.php');
assert_true(!str_contains($schedModule, 'automation.'), 'SchedulerModule has no automation slug refs');
assert_true(!str_contains($schedRegistry, 'automation.'), 'JobHandlerRegistry has no automation slug refs');

$fe = (string) file_get_contents($pkgDir . '/frontend-dist/index.js');
assert_true(str_contains($fe, 'hostPageKey'), 'FE binds host admin page via hostPageKey');
assert_true(str_contains($fe, 'automation.admin'), 'hostPageKey automation.admin present');

$mainTsx = (string) file_get_contents($repoRoot . '/frontend/src/main.tsx');
assert_true(!preg_match("/import\\s+['\"]@\\/modules\\/automation['\"]/", $mainTsx), 'host main has no static automation module import');
assert_true(str_contains($mainTsx, "provideHostAdminPage('automation.admin'"), 'host provides automation.admin page');

$adminPage = (string) file_get_contents($repoRoot . '/frontend/src/admin/pages/AutomationAdminPage.tsx');
assert_true(str_contains($adminPage, '/admin/automations/triggers'), 'admin page loads triggers from API');
assert_true(!preg_match('/const\\s+EVENTS\\s*=/', $adminPage), 'admin page has no static EVENTS whitelist');

$schedPage = (string) file_get_contents($repoRoot . '/frontend/src/admin/pages/SchedulerPage.tsx');
assert_true(!str_contains($schedPage, "'automation.resume'"), 'SchedulerPage has no automation.resume hardcode');

$mig = (string) file_get_contents($pkgDir . '/migrations/001_automation.sql');
assert_true(str_contains($mig, 'CREATE TABLE IF NOT EXISTS'), 'migration is non-destructive IF NOT EXISTS');
assert_true(str_contains($mig, 'automations'), 'migration targets automations');

$probeDir = dirname(__DIR__) . '/tests/fixtures/modules/automation-event-probe';
assert_true(is_dir($probeDir), 'automation-event-probe fixture exists');
$probeSrc = (string) file_get_contents($probeDir . '/backend/AutomationEventProbeModule.php');
assert_true(str_contains($probeSrc, 'probe.signal.fired'), 'probe declares unknown event');
assert_true(str_contains($probeSrc, 'declare('), 'probe uses events.declare');

// РІР‚вЂќРІР‚вЂќ Runtime: EventCatalog discovery + clearOwner + scheduler namespace РІР‚вЂќРІР‚вЂќ
if (!extension_loaded('pdo_sqlite')) {
    echo "  SKIP automation runtime boundary (pdo_sqlite missing)\n";
    return;
}

require_once __DIR__ . '/helpers.php';
$ctx = jasefly_test_sqlite_boot();
$db = $ctx['db'];
$pdo = $ctx['pdo'];

EventCatalog::resetForTests();
$dispatcher = new EventDispatcher();
$eventsAuto = new EventsAdapter($dispatcher, $db, 'automation');
$eventsProbe = new EventsAdapter($dispatcher, $db, 'automation-event-probe');

assert_true(!$eventsAuto->hasDeclared('probe.signal.fired'), 'probe event absent before declare');
$eventsProbe->declare('probe.signal.fired', [
    'label' => 'Probe signal fired',
    'category' => 'probe',
]);
assert_true($eventsAuto->hasDeclared('probe.signal.fired'), 'automation can discover probe event via hasDeclared');
$listed = $eventsAuto->listDeclared();
$ids = array_map(static fn(array $e) => $e['id'], $listed);
assert_true(in_array('probe.signal.fired', $ids, true), 'listDeclared includes probe event');

$cleared = EventCatalog::clearOwner('automation-event-probe');
assert_true($cleared >= 1, 'clearOwner removes probe declarations');
assert_true(!$eventsAuto->hasDeclared('probe.signal.fired'), 'probe event unavailable after owner clear (disable)');

// Re-declare after "re-enable"
$eventsProbe->declare('probe.signal.fired', ['label' => 'Probe signal fired', 'category' => 'probe']);
assert_true($eventsAuto->hasDeclared('probe.signal.fired'), 're-enable restores catalog entry');

JobHandlerRegistry::resetForTests();
$sched = new SchedulerAdapter($db, 'automation');
$sched->registerHandler('resume', static function (): void {});
assert_true(JobHandlerRegistry::has('automation.resume'), 'resume resolves to automation.resume');
assert_true(JobHandlerRegistry::ownerOf('automation.resume') === 'automation', 'resume owned by automation');
$sched->releasePackage();
assert_true(!JobHandlerRegistry::has('automation.resume'), 'release unregisters resume');

$app = array_merge($ctx['app'] ?? [], [
    'modules' => ['disabled' => []],
    'jwt_secret' => 'test-secret-automation-boundary',
]);
$pdo->exec("CREATE TABLE IF NOT EXISTS modules (name TEXT PRIMARY KEY, is_enabled INTEGER NOT NULL DEFAULT 0, settings TEXT NULL)");
$pdo->exec("INSERT INTO modules (name, is_enabled) VALUES ('automation', 1) ON CONFLICT(name) DO UPDATE SET is_enabled=1");

$registryPath = sys_get_temp_dir() . '/jasefly-automation-empty-' . getmypid();
@mkdir($registryPath, 0775, true);
$registry = new ModuleRegistry($db, $app, $registryPath);
$bundledStub = new class extends AbstractModule {
    public function name(): string { return 'automation'; }
    public function label(): string { return 'Automation Bundled Stub'; }
    public function registerRoutes(Router $router, Database $db, array $app, string $apiPrefix): void {}
};
$registry->register($bundledStub);

$manifest = ModuleManifest::fromArray([
    'schema_version' => 1,
    'type' => 'jasefly-module',
    'name' => 'Automation',
    'slug' => 'automation',
    'version' => '1.0.0',
    'jasefly' => ['api_version' => 1, 'sdk_version' => 1, 'min_version' => '1.0.0'],
    'entrypoints' => ['backend' => 'backend/AutomationModule.php'],
    'dependencies' => ['required' => ['system' => '>=1.0.0']],
    'capabilities' => [
        'requires' => [
            'api.routes', 'admin.pages', 'permissions.check', 'scheduler.jobs',
            'events.publish', 'events.subscribe',
        ],
        'optional' => ['mail.send', 'notifications.send', 'http.client'],
        'provides' => ['automation.engine'],
    ],
]);

require_once $pkgDir . '/backend/ConditionEngine.php';
require_once $pkgDir . '/backend/FormsSubmissionCompatAction.php';
require_once $pkgDir . '/backend/AutomationEngine.php';
require_once $pkgDir . '/backend/AutomationModule.php';
$inner = new \App\PackageModules\Automation\AutomationModule();
$inner->setPackageManifest($manifest);
$registry->register(new PackageModuleAdapter($inner, $manifest));

$found = null;
foreach ($registry->all() as $mod) {
    if ($mod->name() === 'automation') {
        $found = $mod;
        break;
    }
}
assert_true($found instanceof PackageModuleAdapter, 'package adapter replaces bundled same slug');

$emptyReg = new ModuleRegistry($db, $app, $registryPath);
$emptyReg->discover();
$hasAuto = false;
foreach ($emptyReg->all() as $mod) {
    if ($mod->name() === 'automation') {
        $hasAuto = true;
    }
}
assert_true($hasAuto === false, 'clean discover without Modules/Automation has no automation');

EventCatalog::resetForTests();
($ctx['cleanup'])();
