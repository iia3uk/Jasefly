<?php
declare(strict_types=1);

require_once __DIR__ . '/_package_dir.php';

/**
 * Module boundary: newsletter is a ZIP package (Scheduler + Platform Mail, stableType widget).
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
assert_true(!is_dir(dirname(__DIR__) . '/src/Modules/Newsletter'), 'bundled Modules/Newsletter removed from discovery');
assert_true(!is_dir($repoRoot . '/backend/legacy-extract/Newsletter'), 'legacy Newsletter removed after live verify');
jasefly_test_assert_package_identity('newsletter', $repoRoot);

$pkgDir = jasefly_test_package_dir('newsletter');
assert_true($pkgDir !== null, 'newsletter package directory exists');
assert_true(is_dir($pkgDir), 'newsletter package directory exists');
assert_true(is_file($pkgDir . '/module.json'), 'newsletter module.json exists');
assert_true(is_file($pkgDir . '/backend/NewsletterModule.php'), 'newsletter backend entry exists');
assert_true(is_file($pkgDir . '/backend/NewsletterService.php'), 'newsletter service exists');

$mf = json_decode((string) file_get_contents($pkgDir . '/module.json'), true);
assert_true(is_array($mf) && ($mf['slug'] ?? '') === 'newsletter', 'newsletter slug is newsletter');
assert_true(($mf['dependencies']['required']['system'] ?? '') !== '', 'newsletter requires system');
assert_true(in_array('scheduler.jobs', $mf['capabilities']['requires'] ?? [], true), 'newsletter requires scheduler.jobs');

$phpFiles = glob($pkgDir . '/backend/*.php') ?: [];
$forbidden = false;
$usesJobRegistry = false;
$usesConcreteMailer = false;
foreach ($phpFiles as $file) {
    $src = (string) file_get_contents($file);
    if (preg_match('/App\\\\(Core|Services|Modules|Controllers)\\\\/', $src) === 1) {
        $forbidden = true;
        break;
    }
    if (preg_match('/(?:use\\s+.*?JobHandlerRegistry|JobHandlerRegistry::)/', $src) === 1) {
        $usesJobRegistry = true;
    }
    if (preg_match('/(?:use\\s+.*?Mail\\\\Mailer|new\\s+\\\\?App\\\\Modules\\\\Mail\\\\Mailer|Modules\\\\Mail\\\\Mailer)/', $src) === 1) {
        $usesConcreteMailer = true;
    }
}
assert_true(!$forbidden, 'newsletter package has no Core/Services/Modules/Controllers imports');
assert_true(!$usesJobRegistry, 'newsletter package does not use JobHandlerRegistry directly');
assert_true(!$usesConcreteMailer, 'newsletter package does not depend on concrete Mailer');

$modSrc = (string) file_get_contents($pkgDir . '/backend/NewsletterModule.php');
assert_true(str_contains($modSrc, 'AbstractPackageModule'), 'newsletter extends AbstractPackageModule');
assert_true(str_contains($modSrc, "registerHandler('campaign.send'"), 'registers local campaign.send job');
assert_true(str_contains($modSrc, 'newsletter-signup'), 'declares newsletter-signup block');
assert_true(
    substr_count($modSrc, 'newsletter.view')
    + substr_count($modSrc, 'newsletter.manage')
    + substr_count($modSrc, 'newsletter.send')
    + substr_count($modSrc, 'newsletter.subscribers') >= 4,
    'newsletter permissions wired'
);

$svcSrc = (string) file_get_contents($pkgDir . '/backend/NewsletterService.php');
assert_true(str_contains($svcSrc, 'PlatformMailInterface'), 'service uses Platform Mail interface');
assert_true(str_contains($svcSrc, 'PlatformSchedulerInterface'), 'service uses Platform Scheduler interface');
assert_true(str_contains($svcSrc, 'isAvailable'), 'service checks mail availability');
assert_true(str_contains($svcSrc, 'enqueueEx'), 'enqueues via scheduler enqueueEx');
assert_true(str_contains($svcSrc, "'campaign.send'"), 'enqueues campaign.send local type');
assert_true(!str_contains($svcSrc, 'JobQueue'), 'service does not use JobQueue directly');

$mailIface = (string) file_get_contents(dirname(__DIR__) . '/src/Platform/Contracts/PlatformMailInterface.php');
assert_true(str_contains($mailIface, 'isAvailable'), 'PlatformMailInterface exposes isAvailable');
assert_true(str_contains($mailIface, 'sendHtml'), 'PlatformMailInterface exposes sendHtml');

$schedModule = (string) file_get_contents(dirname(__DIR__) . '/src/Modules/Scheduler/SchedulerModule.php');
$schedRegistry = (string) file_get_contents(dirname(__DIR__) . '/src/Modules/Scheduler/JobHandlerRegistry.php');
assert_true(!str_contains($schedModule, 'newsletter.'), 'SchedulerModule has no newsletter slug refs');
assert_true(!str_contains($schedRegistry, 'newsletter.'), 'JobHandlerRegistry has no newsletter slug refs');

$fe = (string) file_get_contents($pkgDir . '/frontend-dist/index.js');
assert_true(str_contains($fe, 'stableType: true') || str_contains($fe, 'stableType:true'), 'FE uses stableType for frozen widget');
assert_true(str_contains($fe, "type: 'newsletter-signup'") || str_contains($fe, 'type:"newsletter-signup"'), 'FE registers newsletter-signup');
assert_true(str_contains($fe, 'hostPageKey'), 'FE binds host admin pages via hostPageKey');
assert_true(str_contains($fe, 'newsletter.subscribers') && str_contains($fe, 'newsletter.campaigns'), 'hostPageKey keys present');

$freeze = $repoRoot . '/frontend/src/builder/manifest/widget-types.v1.json';
$freezeJson = json_decode((string) file_get_contents($freeze), true);
$widgets = $freezeJson['widgets'] ?? [];
assert_true(in_array('newsletter-signup', $widgets, true), 'frozen widget-types keeps newsletter-signup');

$stablePath = $repoRoot . '/frontend/src/builder/manifest/package-stable-widget-types.v1.json';
$stableJson = json_decode((string) file_get_contents($stablePath), true);
assert_true(($stableJson['widgets']['newsletter-signup'] ?? '') === 'newsletter', 'package-stable map owns newsletter-signupРІвЂ вЂ™newsletter');

$mainTsx = (string) file_get_contents($repoRoot . '/frontend/src/main.tsx');
assert_true(!preg_match("/import\\s+['\"]@\\/modules\\/newsletter['\"]/", $mainTsx), 'host main has no static newsletter module import');
assert_true(str_contains($mainTsx, "provideHostAdminPage('newsletter.subscribers'"), 'host provides newsletter.subscribers page');
assert_true(str_contains($mainTsx, "provideHostAdminPage('newsletter.campaigns'"), 'host provides newsletter.campaigns page');

$widgetsIndex = (string) file_get_contents($repoRoot . '/frontend/src/builder/widgets/index.ts');
assert_true(!str_contains($widgetsIndex, 'registerNewsletterWidgets()'), 'host builder index does not call registerNewsletterWidgets');

$mig = (string) file_get_contents($pkgDir . '/migrations/001_newsletter.sql');
assert_true(str_contains($mig, 'CREATE TABLE IF NOT EXISTS'), 'migration is non-destructive IF NOT EXISTS');
assert_true(str_contains($mig, 'subscribers'), 'migration targets subscribers');
assert_true(str_contains($mig, 'newsletter_campaigns'), 'migration targets newsletter_campaigns');

// РІР‚вЂќРІР‚вЂќ Package wins over same-slug bundled РІР‚вЂќРІР‚вЂќ
if (!extension_loaded('pdo_sqlite')) {
    echo "  SKIP newsletter runtime boundary (pdo_sqlite missing)\n";
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
$pdo->exec("INSERT INTO modules (name, is_enabled) VALUES ('newsletter', 1)");

// Pre-existing tables (adoption)
$pdo->exec(
    "CREATE TABLE IF NOT EXISTS subscribers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT NOT NULL UNIQUE,
        name TEXT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )"
);
$pdo->exec(
    "CREATE TABLE IF NOT EXISTS newsletter_campaigns (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        subject TEXT NOT NULL,
        html TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'draft',
        sent_count INTEGER NOT NULL DEFAULT 0
    )"
);
$pdo->exec("INSERT INTO subscribers (email, name, status) VALUES ('adopt@example.com', 'Adopt', 'active')");
$pdo->exec("INSERT INTO newsletter_campaigns (name, subject, html, status) VALUES ('C1', 'Hi', '<p>x</p>', 'draft')");
$beforeSubs = (int) ($pdo->query('SELECT COUNT(*) FROM subscribers')->fetchColumn() ?: 0);
$beforeCamps = (int) ($pdo->query('SELECT COUNT(*) FROM newsletter_campaigns')->fetchColumn() ?: 0);
assert_true($beforeSubs >= 1 && $beforeCamps >= 1, 'pre-existing newsletter rows present for adoption');

$app = array_merge($ctx['app'] ?? [], [
    'modules' => ['disabled' => []],
    'jwt_secret' => 'test-secret-newsletter-boundary',
]);

$registryPath = sys_get_temp_dir() . '/jasefly-newsletter-empty-' . getmypid();
@mkdir($registryPath, 0775, true);
$registry = new ModuleRegistry($db, $app, $registryPath);

$bundledStub = new class extends AbstractModule {
    public function name(): string { return 'newsletter'; }
    public function label(): string { return 'Newsletter Bundled Stub'; }
    public function registerRoutes(Router $router, Database $db, array $app, string $apiPrefix): void {}
};
$registry->register($bundledStub);

$manifest = ModuleManifest::fromArray([
    'schema_version' => 1,
    'type' => 'jasefly-module',
    'name' => 'Newsletter',
    'slug' => 'newsletter',
    'version' => '1.0.0',
    'jasefly' => ['api_version' => 1, 'sdk_version' => 1, 'min_version' => '1.0.0'],
    'entrypoints' => ['backend' => 'backend/NewsletterModule.php'],
    'dependencies' => ['required' => ['system' => '>=1.0.0']],
    'capabilities' => [
        'requires' => ['api.routes', 'admin.pages', 'permissions.check', 'scheduler.jobs', 'events.publish', 'builder.widgets'],
        'optional' => ['mail.send'],
        'provides' => ['newsletter.subscribe', 'newsletter.campaigns'],
    ],
]);

require_once $pkgDir . '/backend/CsvExport.php';
require_once $pkgDir . '/backend/NewsletterService.php';
require_once $pkgDir . '/backend/NewsletterModule.php';
$inner = new \App\PackageModules\Newsletter\NewsletterModule();
$inner->setPackageManifest($manifest);
$registry->register(new PackageModuleAdapter($inner, $manifest));

$found = null;
foreach ($registry->all() as $mod) {
    if ($mod->name() === 'newsletter') {
        $found = $mod;
        break;
    }
}
assert_true($found instanceof PackageModuleAdapter, 'package adapter replaces bundled same slug');

JobHandlerRegistry::resetForTests();
$sched = new SchedulerAdapter($db, 'newsletter');
$sched->registerHandler('campaign.send', static function (): void {});
assert_true(JobHandlerRegistry::has('newsletter.campaign.send'), 'campaign.send resolves to newsletter.campaign.send');
assert_true(JobHandlerRegistry::ownerOf('newsletter.campaign.send') === 'newsletter', 'campaign.send owned by newsletter');
$sched->releasePackage();
assert_true(!JobHandlerRegistry::has('newsletter.campaign.send'), 'release unregisters campaign.send (disabled package has no active handlers)');
$sched->registerHandler('campaign.send', static function (): void {});
$types = JobHandlerRegistry::types();
$sendCount = count(array_filter($types, static fn($t) => $t === 'newsletter.campaign.send'));
assert_true($sendCount === 1, 're-enable restores campaign.send without duplicates');

$afterSubs = (int) ($pdo->query('SELECT COUNT(*) FROM subscribers')->fetchColumn() ?: 0);
$afterCamps = (int) ($pdo->query('SELECT COUNT(*) FROM newsletter_campaigns')->fetchColumn() ?: 0);
assert_true($afterSubs === $beforeSubs && $afterCamps === $beforeCamps, 'existing subscriber/campaign data preserved (adoption)');

$emptyReg = new ModuleRegistry($db, $app, $registryPath);
$emptyReg->discover();
$hasNl = false;
foreach ($emptyReg->all() as $mod) {
    if ($mod->name() === 'newsletter') {
        $hasNl = true;
    }
}
assert_true($hasNl === false, 'clean discover without Modules/Newsletter has no newsletter');

($ctx['cleanup'])();
