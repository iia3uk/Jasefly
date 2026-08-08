<?php
declare(strict_types=1);

require_once __DIR__ . '/_package_dir.php';

/**
 * Module boundary: forms is a ZIP package owning frozen builder widget ID `form`.
 * Included from run.php (uses global assert_true).
 */

use App\Core\AbstractModule;
use App\Core\ModuleRegistry;
use App\Core\Modules\ModuleManifest;
use App\Core\Modules\PackageModuleAdapter;
use App\Database;
use App\Router;

$repoRoot = dirname(__DIR__, 2);
assert_true(!is_dir(dirname(__DIR__) . '/src/Modules/Forms'), 'bundled Modules/Forms removed from discovery');

$pkgDir = jasefly_test_package_dir('forms');
assert_true($pkgDir !== null, 'forms package directory exists');
assert_true(is_dir($pkgDir), 'forms package directory exists');
assert_true(is_file($pkgDir . '/module.json'), 'forms module.json exists');
assert_true(is_file($pkgDir . '/backend/FormsModule.php'), 'forms backend entry exists');
assert_true(is_file($pkgDir . '/backend/FormService.php'), 'forms service exists');
assert_true(is_file($pkgDir . '/backend/FormActionRegistry.php'), 'forms action registry exists');

$mf = json_decode((string) file_get_contents($pkgDir . '/module.json'), true);
assert_true(is_array($mf) && ($mf['slug'] ?? '') === 'forms', 'forms slug is forms');
assert_true(($mf['dependencies']['required']['system'] ?? '') !== '', 'forms requires system');

$phpFiles = glob($pkgDir . '/backend/*.php') ?: [];
$forbidden = false;
foreach ($phpFiles as $file) {
    $src = (string) file_get_contents($file);
    if (preg_match('/App\\\\(Core|Services|Modules|Controllers)\\\\/', $src) === 1) {
        $forbidden = true;
        break;
    }
}
assert_true(!$forbidden, 'forms package has no Core/Services/Modules/Controllers imports');

$modSrc = (string) file_get_contents($pkgDir . '/backend/FormsModule.php');
assert_true(str_contains($modSrc, 'AbstractPackageModule'), 'forms extends AbstractPackageModule');
assert_true(str_contains($modSrc, 'form.created') || str_contains($modSrc, "form.created"), 'forms publishes form.created');
assert_true(
    substr_count($modSrc, 'forms.view')
    + substr_count($modSrc, 'forms.manage')
    + substr_count($modSrc, 'forms.submissions')
    + substr_count($modSrc, 'forms.export') >= 4,
    'forms permissions wired'
);

$svcSrc = (string) file_get_contents($pkgDir . '/backend/FormService.php');
assert_true(str_contains($svcSrc, 'form.submitted'), 'FormService publishes form.submitted');

$actionSrc = (string) file_get_contents($pkgDir . '/backend/FormActionRegistry.php');
assert_true(str_contains($actionSrc, 'postJsonOutbound'), 'actions use Platform outbound HTTP');
assert_true(str_contains($actionSrc, 'send_telegram'), 'optional telegram action present');
assert_true(str_contains($actionSrc, 'send_email'), 'optional email action present');

$fe = (string) file_get_contents($pkgDir . '/frontend-dist/index.js');
assert_true(str_contains($fe, 'stableType: true') || str_contains($fe, 'stableType:true'), 'FE uses stableType for frozen widget');
assert_true(str_contains($fe, "type: 'form'") || str_contains($fe, 'type:"form"'), 'FE registers widget form');
assert_true(str_contains($fe, 'hostPageKey'), 'FE binds host admin pages via hostPageKey');
assert_true(str_contains($fe, 'forms.admin') && str_contains($fe, 'forms.submissions'), 'hostPageKey keys present');

$freeze = dirname(__DIR__, 2) . '/frontend/src/builder/manifest/widget-types.v1.json';
$freezeJson = json_decode((string) file_get_contents($freeze), true);
$widgets = $freezeJson['widgets'] ?? [];
assert_true(in_array('form', $widgets, true), 'frozen widget-types keeps form');

$stablePath = dirname(__DIR__, 2) . '/frontend/src/builder/manifest/package-stable-widget-types.v1.json';
$stableJson = json_decode((string) file_get_contents($stablePath), true);
assert_true(($stableJson['widgets']['form'] ?? '') === 'forms', 'package-stable map owns formв†’forms');

$mig = (string) file_get_contents($pkgDir . '/migrations/001_forms.sql');
assert_true(str_contains($mig, 'CREATE TABLE IF NOT EXISTS'), 'migration is non-destructive IF NOT EXISTS');
assert_true(str_contains($mig, '`forms`') || str_contains($mig, 'forms'), 'migration targets forms table');
assert_true(!str_contains($mig, 'fsr_'), 'live forms does not use forms-sdk-reference fsr_ tables');

$fsrDir = $repoRoot . '/modules-src/forms-sdk-reference';
if (!is_dir($fsrDir)) {
    $fsrDir = dirname(__DIR__) . '/tests/fixtures/modules/forms-sdk-reference';
}
assert_true(is_dir($fsrDir), 'forms-sdk-reference remains a separate package');
$fsrMf = json_decode((string) file_get_contents($fsrDir . '/module.json'), true);
assert_true(($fsrMf['slug'] ?? '') === 'forms-sdk-reference', 'forms-sdk-reference slug unchanged');

// вЂ”вЂ” Package wins over same-slug bundled вЂ”вЂ”
if (!extension_loaded('pdo_sqlite')) {
    echo "  SKIP forms runtime boundary (pdo_sqlite missing)\n";
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
$pdo->exec("INSERT INTO modules (name, is_enabled) VALUES ('forms', 1)");

$app = array_merge($ctx['app'] ?? [], [
    'modules' => ['disabled' => []],
    'jwt_secret' => 'test-secret-forms-boundary',
]);

$registryPath = sys_get_temp_dir() . '/jasefly-forms-empty-' . getmypid();
@mkdir($registryPath, 0775, true);
$registry = new ModuleRegistry($db, $app, $registryPath);

$bundledStub = new class extends AbstractModule {
    public function name(): string { return 'forms'; }
    public function label(): string { return 'Forms Bundled Stub'; }
    public function registerRoutes(Router $router, Database $db, array $app, string $apiPrefix): void {}
};
$registry->register($bundledStub);

$manifest = ModuleManifest::fromArray([
    'schema_version' => 1,
    'type' => 'jasefly-module',
    'name' => 'Forms',
    'slug' => 'forms',
    'version' => '1.0.0',
    'jasefly' => ['api_version' => 1, 'sdk_version' => 1, 'min_version' => '1.0.0'],
    'entrypoints' => ['backend' => 'backend/FormsModule.php'],
    'dependencies' => ['required' => ['system' => '>=1.0.0']],
]);

foreach ([
    'ConditionalLogic.php',
    'FormValidator.php',
    'CsvExport.php',
    'FormActionRegistry.php',
    'FormService.php',
    'FormsModule.php',
] as $file) {
    require_once $pkgDir . '/backend/' . $file;
}
$inner = new \App\PackageModules\Forms\FormsModule();
$inner->setPackageManifest($manifest);
$registry->register(new PackageModuleAdapter($inner, $manifest));

$found = null;
foreach ($registry->all() as $mod) {
    if ($mod->name() === 'forms') {
        $found = $mod;
        break;
    }
}
assert_true($found instanceof PackageModuleAdapter, 'package adapter replaces bundled same slug');

$emptyReg = new ModuleRegistry($db, $app, $registryPath);
$emptyReg->discover();
$has = false;
foreach ($emptyReg->all() as $mod) {
    if ($mod->name() === 'forms') {
        $has = true;
    }
}
assert_true($has === false, 'clean discover without Modules/Forms has no forms');

($ctx['cleanup'])();
