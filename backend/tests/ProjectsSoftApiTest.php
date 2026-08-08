<?php
declare(strict_types=1);

/**
 * Projects soft-disable semantics after Content Resources extract.
 * SoftPluginGate unit proof + package Platform registration (not ContentModule).
 */

use App\Core\AbstractModule;
use App\Core\Container;
use App\Core\EventDispatcher;
use App\Core\ModuleRegistry;
use App\Core\Modules\ModuleManifest;
use App\Core\Modules\PackageModuleAdapter;
use App\Database;
use App\Modules\Content\ContentModule;
use App\PackageModules\Projects\ProjectsModule;
use App\Platform\Adapters\ContentResourcesAdapter;
use App\Request;
use App\Router;
use App\Support\SoftPluginGate;

$projectsPackage = dirname(__DIR__, 2) . '/modules-src/projects/backend';
if (!is_dir($projectsPackage)) {
    $projectsPackage = __DIR__ . '/fixtures/modules/projects/backend';
}
require_once $projectsPackage . '/ProjectResourceHandler.php';
require_once $projectsPackage . '/ProjectCategoryResourceHandler.php';
require_once $projectsPackage . '/ProjectsModule.php';

assert_true(SoftPluginGate::decide(true, 'GET', false) === 'pass', 'enabled GET list passes');
assert_true(SoftPluginGate::decide(true, 'POST', false) === 'pass', 'enabled POST passes');
assert_true(SoftPluginGate::decide(false, 'GET', false) === 'empty_list', 'disabled GET list → empty_list');
assert_true(SoftPluginGate::decide(false, 'GET', true) === 'not_found', 'disabled GET item → not_found');
assert_true(SoftPluginGate::decide(false, 'POST', false) === 'plugin_disabled', 'disabled POST → plugin_disabled');
assert_true(SoftPluginGate::decide(false, 'PUT', true) === 'plugin_disabled', 'disabled PUT → plugin_disabled');
assert_true(SoftPluginGate::decide(false, 'DELETE', true) === 'plugin_disabled', 'disabled DELETE → plugin_disabled');

$mod = new ProjectsModule();
assert_true($mod->registersRoutesWhenDisabled() === true, 'ProjectsModule opts into soft routes');
assert_true((new ContentModule())->registersRoutesWhenDisabled() === false, 'ContentModule does not soft-register (opt-in)');

$emptyList = SoftPluginGate::responseFor('empty_list', 'projects');
assert_true(($emptyList['status'] ?? 0) === 200, 'disabled GET list → 200');
assert_true(($emptyList['body']['data'] ?? null) === [], 'disabled GET list body is empty collection');

$notFound = SoftPluginGate::responseFor('not_found', 'projects');
assert_true(($notFound['status'] ?? 0) === 404, 'disabled GET item → 404');

$disabled = SoftPluginGate::responseFor('plugin_disabled', 'projects');
assert_true(($disabled['status'] ?? 0) === 409, 'disabled mutation → 409');
assert_true(($disabled['body']['code'] ?? '') === 'plugin_disabled', 'error code plugin_disabled');

if (!extension_loaded('pdo_sqlite')) {
    echo "  SKIP ProjectsSoftApi route registry (pdo_sqlite missing)\n";
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
$pdo->exec("INSERT INTO modules (name, is_enabled) VALUES ('projects', 1)");

$app = ['version' => '1.0.0', 'jwt_secret' => 'test-secret-for-soft-api', 'storage' => $ctx['storageDir']];
$modulesPath = $ctx['tmpDir'] . '/modules-empty';
@mkdir($modulesPath, 0775, true);

$manifest = ModuleManifest::fromArray([
    'schema_version' => 1,
    'type' => 'jasefly-module',
    'name' => 'Projects',
    'slug' => 'projects',
    'version' => '1.0.0',
    'jasefly' => ['api_version' => 1, 'sdk_version' => 1, 'min_version' => '1.0.0'],
    'entrypoints' => ['backend' => 'backend/ProjectsModule.php'],
]);

ContentResourcesAdapter::resetForTests();
$registry = new ModuleRegistry($db, $app, $modulesPath);
$inner = new ProjectsModule();
$inner->setPackageManifest($manifest);
$adapter = new PackageModuleAdapter($inner, $manifest);
$registry->register($adapter);
Container::getInstance()->set(ModuleRegistry::class, $registry);
Container::getInstance()->set(EventDispatcher::class, $registry->events());

$router = new Router();
$prefix = '/api/v1';
$registry->registerRoutes($router, $prefix);
$registry->boot();

$listMatch = $router->match(new Request('GET', '/api/v1/admin/projects'));
assert_true(($listMatch['status'] ?? 0) === 200, 'enabled package: GET /admin/projects registered via Platform HTTP');
$publicMatch = $router->match(new Request('GET', '/api/v1/projects'));
assert_true(($publicMatch['status'] ?? 0) === 200, 'enabled package: public GET /projects registered');
assert_true((new ContentResourcesAdapter('host'))->has('projects'), 'projects resource registered when enabled');

// Soft gate when plugin disabled (new registry so PluginStateService cache is fresh)
$pdo->exec("UPDATE modules SET is_enabled=0 WHERE name='projects'");
$registryDisabled = new ModuleRegistry($db, $app, $modulesPath);
$registryDisabled->register(new PackageModuleAdapter(new ProjectsModule(), $manifest));
$outList = SoftPluginGate::outcome($registryDisabled, 'projects', 'GET', false);
assert_true($outList !== null && ($outList['status'] ?? 0) === 200, 'disabled GET list → 200 empty');
assert_true(($outList['body']['data'] ?? null) === [], 'disabled GET list empty collection');
$outItem = SoftPluginGate::outcome($registryDisabled, 'projects', 'GET', true);
assert_true($outItem !== null && ($outItem['status'] ?? 0) === 404, 'disabled GET item → 404');
foreach ([['POST', false], ['PUT', true], ['DELETE', true]] as [$method, $isItem]) {
    $out = SoftPluginGate::outcome($registryDisabled, 'projects', $method, $isItem);
    assert_true($out !== null && ($out['status'] ?? 0) === 409, "disabled $method → 409");
}

// ContentModule alone must not own projects routes
$pdo->exec("INSERT INTO modules (name, is_enabled) VALUES ('content', 1) ON CONFLICT(name) DO UPDATE SET is_enabled=1");
$contentOnly = new ModuleRegistry($db, $app, $modulesPath);
$contentOnly->register(new ContentModule());
$contentRouter = new Router();
$contentOnly->registerRoutes($contentRouter, $prefix);
$adminProj = $contentRouter->match(new Request('GET', '/api/v1/admin/projects'));
assert_true(($adminProj['status'] ?? 0) === 404, 'ContentModule does not register admin Projects CRUD');
$publicProj = $contentRouter->match(new Request('GET', '/api/v1/projects'));
assert_true(($publicProj['status'] ?? 0) === 404, 'ContentModule no longer owns public GET /projects (package-owned)');

// Default AbstractModule: registersRoutesWhenDisabled is opt-in false
$defaultMod = new class extends AbstractModule {
    public function name(): string { return 'default-off'; }
    public function registerRoutes(Router $router, Database $db, array $app, string $apiPrefix): void
    {
        $router->get(rtrim($apiPrefix, '/') . '/admin/default-off', static function (): void {});
    }
};
assert_true($defaultMod->registersRoutesWhenDisabled() === false, 'registersRoutesWhenDisabled default false');
$pdo->exec("INSERT INTO modules (name, is_enabled) VALUES ('default-off', 0)");
$regDefault = new ModuleRegistry($db, $app, $modulesPath);
$regDefault->register($defaultMod);
$rDefault = new Router();
$regDefault->registerRoutes($rDefault, $prefix);
$miss = $rDefault->match(new Request('GET', '/api/v1/admin/default-off'));
assert_true(($miss['status'] ?? 0) === 404, 'disabled non-opt-in module does not register routes');

($ctx['cleanup'])();
