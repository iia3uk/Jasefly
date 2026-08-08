<?php
declare(strict_types=1);

require_once __DIR__ . '/_package_dir.php';

/**
 * Module boundary: webhooks is a ZIP package, not a bundled Modules/* plugin.
 * Included from run.php (uses global assert_true).
 */

use App\Core\AbstractModule;
use App\Core\ModuleRegistry;
use App\Core\Modules\ModuleManifest;
use App\Core\Modules\PackageModuleAdapter;
use App\Database;
use App\Router;

$repoRoot = dirname(__DIR__, 2);
$bundled = dirname(__DIR__) . '/src/Modules/Webhooks';
assert_true(!is_dir($bundled), 'bundled Modules/Webhooks removed from discovery path');

$pkgDir = jasefly_test_package_dir('webhooks');
assert_true($pkgDir !== null, 'webhooks package directory exists');
assert_true(is_dir($pkgDir), 'webhooks package directory exists');
assert_true(is_file($pkgDir . '/module.json'), 'webhooks module.json exists');
assert_true(is_file($pkgDir . '/backend/WebhooksModule.php'), 'webhooks backend entry exists');

$mf = json_decode((string) file_get_contents($pkgDir . '/module.json'), true);
assert_true(is_array($mf) && ($mf['slug'] ?? '') === 'webhooks', 'webhooks slug is webhooks');
assert_true(($mf['dependencies']['required']['system'] ?? '') !== '', 'webhooks requires system');

$phpSrc = (string) file_get_contents($pkgDir . '/backend/WebhooksModule.php');
assert_true(!preg_match('/App\\\\(Core|Services|Modules|Controllers)\\\\/', $phpSrc), 'webhooks package has no Core/Services imports');
assert_true(str_contains($phpSrc, 'AbstractPackageModule'), 'webhooks extends AbstractPackageModule');
assert_true(str_contains($phpSrc, 'postJsonOutbound'), 'webhooks uses Platform outbound HTTP');

$httpIface = (string) file_get_contents(dirname(__DIR__) . '/src/Platform/Contracts/PlatformHttpInterface.php');
assert_true(
    str_contains($httpIface, 'isSafeOutboundUrl') && str_contains($httpIface, 'postJsonOutbound'),
    'Platform HTTP outbound helpers exist'
);

// вЂ”вЂ” Package wins over same-slug bundled вЂ”вЂ”
if (!extension_loaded('pdo_sqlite')) {
    echo "  SKIP webhooks runtime boundary (pdo_sqlite missing)\n";
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
$pdo->exec("INSERT INTO modules (name, is_enabled) VALUES ('webhooks', 1)");

$app = array_merge($ctx['app'] ?? [], [
    'modules' => ['disabled' => []],
    'jwt_secret' => 'test-secret-webhooks-boundary',
]);

$registryPath = sys_get_temp_dir() . '/jasefly-wh-bundled-empty-' . getmypid();
@mkdir($registryPath, 0775, true);
$registry = new ModuleRegistry($db, $app, $registryPath);

$bundledStub = new class extends AbstractModule {
    public function name(): string
    {
        return 'webhooks';
    }

    public function label(): string
    {
        return 'Webhooks Bundled Stub';
    }

    public function registerRoutes(Router $router, Database $db, array $app, string $apiPrefix): void
    {
    }
};

$registry->register($bundledStub);

$manifest = ModuleManifest::fromArray([
    'schema_version' => 1,
    'type' => 'jasefly-module',
    'name' => 'Webhooks',
    'slug' => 'webhooks',
    'version' => '1.0.0',
    'jasefly' => ['api_version' => 1, 'sdk_version' => 1, 'min_version' => '1.0.0'],
    'entrypoints' => ['backend' => 'backend/WebhooksModule.php'],
    'dependencies' => ['required' => ['system' => '>=1.0.0']],
    'capabilities' => ['requires' => ['http.client'], 'provides' => ['webhooks.dispatch']],
]);

require_once $pkgDir . '/backend/WebhooksModule.php';
$inner = new \App\PackageModules\Webhooks\WebhooksModule();
$inner->setPackageManifest($manifest);
$adapter = new PackageModuleAdapter($inner, $manifest);
$registry->register($adapter);

$found = null;
foreach ($registry->all() as $mod) {
    if ($mod->name() === 'webhooks') {
        $found = $mod;
        break;
    }
}
assert_true($found instanceof PackageModuleAdapter, 'package adapter replaces bundled same slug');
assert_true($found->label() === 'Webhooks', 'winning module is package label');

// Clean discover without Modules/Webhooks в†’ no webhooks module
$emptyReg = new ModuleRegistry($db, $app, $registryPath);
$emptyReg->discover();
$hasWh = false;
foreach ($emptyReg->all() as $mod) {
    if ($mod->name() === 'webhooks') {
        $hasWh = true;
    }
}
assert_true($hasWh === false, 'clean discover without Modules/Webhooks has no webhooks');

($ctx['cleanup'])();
