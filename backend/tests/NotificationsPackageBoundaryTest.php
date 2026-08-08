<?php
declare(strict_types=1);

require_once __DIR__ . '/_package_dir.php';

/**
 * Module boundary: notifications ZIP provides notifications.send via registerBackend.
 * Included from run.php (uses global assert_true).
 */

use App\Core\AbstractModule;
use App\Core\ModuleRegistry;
use App\Core\Modules\ModuleManifest;
use App\Core\Modules\PackageModuleAdapter;
use App\Database;
use App\Platform\Adapters\NotificationsAdapter;
use App\Platform\Capabilities\CapabilityRegistry;
use App\Router;

$repoRoot = dirname(__DIR__, 2);
assert_true(!is_dir(dirname(__DIR__) . '/src/Modules/Notifications'), 'bundled Modules/Notifications removed from discovery');
assert_true(!is_dir($repoRoot . '/backend/legacy-extract/Notifications'), 'legacy Notifications removed after live verify');
jasefly_test_assert_package_identity('notifications', $repoRoot);

$pkgDir = jasefly_test_package_dir('notifications');
assert_true($pkgDir !== null, 'notifications package directory exists');
assert_true(is_dir($pkgDir), 'notifications package directory exists');
assert_true(is_file($pkgDir . '/module.json'), 'notifications module.json exists');
assert_true(is_file($pkgDir . '/backend/NotificationsModule.php'), 'notifications backend entry exists');
assert_true(is_file($pkgDir . '/backend/NotificationInbox.php'), 'notifications inbox service exists');

$mf = json_decode((string) file_get_contents($pkgDir . '/module.json'), true);
assert_true(is_array($mf) && ($mf['slug'] ?? '') === 'notifications', 'notifications slug is notifications');
assert_true(in_array('notifications.send', $mf['capabilities']['provides'] ?? [], true), 'package provides notifications.send');

$phpFiles = glob($pkgDir . '/backend/*.php') ?: [];
$forbidden = false;
$usesMailer = false;
$usesTelegram = false;
foreach ($phpFiles as $file) {
    $src = (string) file_get_contents($file);
    if (preg_match('/App\\\\(Core|Services|Modules|Controllers)\\\\/', $src) === 1) {
        $forbidden = true;
        break;
    }
    if (preg_match('/Mail\\\\Mailer|Modules\\\\Mail\\\\Mailer/', $src) === 1) {
        $usesMailer = true;
    }
    if (preg_match('/TelegramNotifier/', $src) === 1) {
        $usesTelegram = true;
    }
}
assert_true(!$forbidden, 'notifications package has no Core/Services/Modules/Controllers imports');
assert_true(!$usesMailer, 'notifications package does not depend on concrete Mailer');
assert_true(!$usesTelegram, 'notifications package does not depend on concrete TelegramNotifier');

$modSrc = (string) file_get_contents($pkgDir . '/backend/NotificationsModule.php');
assert_true(str_contains($modSrc, 'AbstractPackageModule'), 'notifications extends AbstractPackageModule');
assert_true(str_contains($modSrc, 'registerBackend'), 'registers notifications backend');

$svcSrc = (string) file_get_contents($pkgDir . '/backend/NotificationInbox.php');
assert_true(str_contains($svcSrc, 'class NotificationInbox'), 'inbox class name avoids forbidden NotificationService ctor pattern');
assert_true(str_contains($svcSrc, 'PlatformMailInterface'), 'service uses Platform Mail');
assert_true(str_contains($svcSrc, 'PlatformHttpInterface'), 'service uses Platform HTTP');
assert_true(str_contains($svcSrc, 'isAvailable'), 'service checks mail isAvailable');
assert_true(str_contains($svcSrc, 'postJsonOutbound'), 'telegram via postJsonOutbound');

$iface = (string) file_get_contents(dirname(__DIR__) . '/src/Platform/Contracts/PlatformNotificationsInterface.php');
assert_true(str_contains($iface, 'isAvailable'), 'PlatformNotificationsInterface exposes isAvailable');
assert_true(str_contains($iface, 'registerBackend'), 'PlatformNotificationsInterface exposes registerBackend');

$adapter = (string) file_get_contents(dirname(__DIR__) . '/src/Platform/Adapters/NotificationsAdapter.php');
assert_true(str_contains($adapter, 'clearOwner'), 'NotificationsAdapter has clearOwner');
assert_true(!str_contains($adapter, 'Modules\\Notifications\\NotificationService'), 'adapter has no concrete NotificationService import');

$capsSrc = (string) file_get_contents(dirname(__DIR__) . '/src/Platform/Capabilities/CapabilityRegistry.php');
assert_true(!str_contains($capsSrc, "'notifications.send'"), 'notifications.send is not a core default capability');

$fe = (string) file_get_contents($pkgDir . '/frontend-dist/index.js');
assert_true(str_contains($fe, 'hostPageKey'), 'FE binds host admin page via hostPageKey');
assert_true(str_contains($fe, 'notifications.admin'), 'hostPageKey notifications.admin present');
assert_true(str_contains($fe, 'admin.header'), 'FE registers admin.header slot for bell');
assert_true(str_contains($fe, 'notifications.bell'), 'hostPageKey notifications.bell present');

$mainTsx = (string) file_get_contents($repoRoot . '/frontend/src/main.tsx');
assert_true(!preg_match("/import\\s+['\"]@\\/modules\\/notifications['\"]/", $mainTsx), 'host main has no static notifications module import');
assert_true(str_contains($mainTsx, "provideHostAdminPage('notifications.admin'"), 'host provides notifications.admin page');
assert_true(str_contains($mainTsx, "provideHostAdminPage('notifications.bell'"), 'host provides notifications.bell');

$adminApp = (string) file_get_contents($repoRoot . '/frontend/src/admin/AdminApp.tsx');
assert_true(!str_contains($adminApp, 'modules/notifications/NotificationsBell'), 'AdminApp has no hard NotificationsBell import');
assert_true(str_contains($adminApp, "HostSlot") && str_contains($adminApp, 'admin.header'), 'AdminApp mounts admin.header HostSlot');

// Consumers must not import concrete NotificationService
$autoDir = jasefly_test_package_dir('automation');
assert_true($autoDir !== null, 'automation package directory exists');
$autoEngine = (string) file_get_contents($autoDir . '/backend/AutomationEngine.php');
assert_true(str_contains($autoEngine, 'PlatformNotificationsInterface'), 'Automation uses Platform Notifications');
assert_true(str_contains($autoEngine, 'isAvailable'), 'Automation checks notifications isAvailable');
assert_true(!str_contains($autoEngine, 'NotificationService'), 'Automation has no NotificationService import');

$formsDir = jasefly_test_package_dir('forms');
assert_true($formsDir !== null, 'forms package directory exists');
$formsAct = (string) file_get_contents($formsDir . '/backend/FormActionRegistry.php');
assert_true(str_contains($formsAct, 'PlatformNotificationsInterface'), 'Forms uses Platform Notifications');
assert_true(!preg_match('/Modules\\\\Notifications\\\\NotificationService/', $formsAct), 'Forms has no concrete NotificationService');

$mig = (string) file_get_contents($pkgDir . '/migrations/001_notifications.sql');
assert_true(str_contains($mig, 'CREATE TABLE IF NOT EXISTS'), 'migration is non-destructive IF NOT EXISTS');
assert_true(str_contains($mig, 'notifications'), 'migration targets notifications');

// РІР‚вЂќРІР‚вЂќ Generic capability provide/revoke (unknown slug, no core map) РІР‚вЂќРІР‚вЂќ
NotificationsAdapter::resetForTests();
$caps = new CapabilityRegistry(null);
assert_true(!$caps->has('notifications.send'), 'notifications.send absent without provider');
$probeSlug = 'zed-notif-cap-probe';
$caps->register('notifications.send', 'module.' . $probeSlug, $probeSlug, 80);
assert_true($caps->has('notifications.send'), 'unknown package can provide notifications.send');
assert_true($caps->resolveProvider('notifications.send') === 'module.' . $probeSlug, 'provider resolves without core slug map');
$caps->revokeModule($probeSlug);
assert_true(!$caps->has('notifications.send'), 'revoke removes package-provided capability');

$adapterA = new NotificationsAdapter($probeSlug);
assert_true(!$adapterA->isAvailable(), 'backend unavailable before registerBackend');
$hits = 0;
$adapterA->registerBackend(
    static function () use (&$hits): void { $hits++; },
    static function (): void {},
);
assert_true($adapterA->isAvailable(), 'backend available after registerBackend');
$adapterA->notifyAdmins('t', 'title', 'body');
assert_true($hits === 1, 'notifyAdmins reaches registered backend');
NotificationsAdapter::clearOwner($probeSlug);
assert_true(!$adapterA->isAvailable(), 'clearOwner makes backend unavailable');
$adapterA->notifyAdmins('t', 'title', 'body');
assert_true($hits === 1, 'notifyAdmins no-ops when unavailable (consumers do not crash)');

// Re-enable
$adapterA->registerBackend(
    static function () use (&$hits): void { $hits++; },
    static function (): void {},
);
assert_true($adapterA->isAvailable(), 're-enable restores backend');
NotificationsAdapter::resetForTests();

// РІР‚вЂќРІР‚вЂќ Package wins over same-slug bundled РІР‚вЂќРІР‚вЂќ
if (!extension_loaded('pdo_sqlite')) {
    echo "  SKIP notifications runtime boundary (pdo_sqlite missing)\n";
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
$pdo->exec("INSERT INTO modules (name, is_enabled) VALUES ('notifications', 1)");
$pdo->exec(
    "CREATE TABLE IF NOT EXISTS notifications (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NULL,
        type TEXT NOT NULL,
        title TEXT NOT NULL,
        body TEXT NULL,
        action_url TEXT NULL,
        icon TEXT NULL,
        priority TEXT NOT NULL DEFAULT 'normal',
        is_read INTEGER NOT NULL DEFAULT 0,
        dedupe_key TEXT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )"
);
$pdo->exec("INSERT INTO notifications (type, title, body, is_read) VALUES ('system', 'Adopted', 'keep', 0)");
$before = (int) ($pdo->query('SELECT COUNT(*) FROM notifications')->fetchColumn() ?: 0);
assert_true($before >= 1, 'pre-existing notification rows present for adoption');

$app = array_merge($ctx['app'] ?? [], [
    'modules' => ['disabled' => []],
    'jwt_secret' => 'test-secret-notifications-boundary',
]);
$registryPath = sys_get_temp_dir() . '/jasefly-notifications-empty-' . getmypid();
@mkdir($registryPath, 0775, true);
$registry = new ModuleRegistry($db, $app, $registryPath);
$bundledStub = new class extends AbstractModule {
    public function name(): string { return 'notifications'; }
    public function label(): string { return 'Notifications Bundled Stub'; }
    public function registerRoutes(Router $router, Database $db, array $app, string $apiPrefix): void {}
};
$registry->register($bundledStub);

$manifest = ModuleManifest::fromArray([
    'schema_version' => 1,
    'type' => 'jasefly-module',
    'name' => 'Notifications',
    'slug' => 'notifications',
    'version' => '1.0.0',
    'jasefly' => ['api_version' => 1, 'sdk_version' => 1, 'min_version' => '1.0.0'],
    'entrypoints' => ['backend' => 'backend/NotificationsModule.php'],
    'dependencies' => ['required' => ['system' => '>=1.0.0']],
    'capabilities' => [
        'requires' => ['api.routes', 'admin.pages', 'permissions.check'],
        'optional' => ['mail.send', 'http.client'],
        'provides' => ['notifications.send'],
    ],
]);

require_once $pkgDir . '/backend/NotificationInbox.php';
require_once $pkgDir . '/backend/NotificationsModule.php';
$inner = new \App\PackageModules\Notifications\NotificationsModule();
$inner->setPackageManifest($manifest);
$registry->register(new PackageModuleAdapter($inner, $manifest));

$found = null;
foreach ($registry->all() as $mod) {
    if ($mod->name() === 'notifications') {
        $found = $mod;
        break;
    }
}
assert_true($found instanceof PackageModuleAdapter, 'package adapter replaces bundled same slug');

$after = (int) ($pdo->query('SELECT COUNT(*) FROM notifications')->fetchColumn() ?: 0);
assert_true($after === $before, 'existing notification data preserved (adoption)');

$emptyReg = new ModuleRegistry($db, $app, $registryPath);
$emptyReg->discover();
$hasN = false;
foreach ($emptyReg->all() as $mod) {
    if ($mod->name() === 'notifications') {
        $hasN = true;
    }
}
assert_true($hasN === false, 'clean discover without Modules/Notifications has no notifications');

NotificationsAdapter::resetForTests();
($ctx['cleanup'])();
