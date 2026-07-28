<?php
declare(strict_types=1);

/**
 * H4 Design B — behavioral SoftPluginGate + route registration (R3).
 * Primary proof is registerRoutes + SoftPluginGate::outcome (no Response exit).
 */

use App\Core\AbstractModule;
use App\Core\Container;
use App\Core\ModuleRegistry;
use App\Database;
use App\Modules\Content\ContentModule;
use App\Modules\Projects\ProjectsModule;
use App\Request;
use App\Router;
use App\Support\SoftPluginGate;

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
$pdo->exec("INSERT INTO modules (name, is_enabled) VALUES ('projects', 0)");

$app = ['version' => '1.0.0', 'jwt_secret' => 'test-secret-for-soft-api'];
$modulesPath = $ctx['tmpDir'] . '/modules-empty';
@mkdir($modulesPath, 0775, true);

$registry = new ModuleRegistry($db, $app, $modulesPath);
$registry->register(new ProjectsModule());
Container::getInstance()->set(ModuleRegistry::class, $registry);

$bootState = (object) ['count' => 0];
$softCounter = new class ($bootState) extends AbstractModule {
    public function __construct(private object $bootState) {}
    public function name(): string { return 'soft-counter'; }
    public function registersRoutesWhenDisabled(): bool { return true; }
    public function boot(Database $db, array $app): void { $this->bootState->count++; }
    public function registerRoutes(Router $router, Database $db, array $app, string $apiPrefix): void
    {
        $router->get(rtrim($apiPrefix, '/') . '/admin/soft-counter', static function (): void {});
    }
};
$pdo->exec("INSERT INTO modules (name, is_enabled) VALUES ('soft-counter', 0)");
$registry->register($softCounter);

$router = new Router();
$prefix = '/api/v1';
$registry->registerRoutes($router, $prefix);
$registry->boot();

assert_true((int) $bootState->count === 0, 'disabled soft module is not booted merely because routes registered');

$listMatch = $router->match(new Request('GET', '/api/v1/admin/projects'));
assert_true(($listMatch['status'] ?? 0) === 200, 'disabled: GET /admin/projects route registered');
$itemMatch = $router->match(new Request('GET', '/api/v1/admin/projects/1'));
assert_true(($itemMatch['status'] ?? 0) === 200, 'disabled: GET /admin/projects/{id} route registered');
$postMatch = $router->match(new Request('POST', '/api/v1/admin/projects'));
assert_true(($postMatch['status'] ?? 0) === 200, 'disabled: POST /admin/projects route registered');
$putMatch = $router->match(new Request('PUT', '/api/v1/admin/projects/1'));
assert_true(($putMatch['status'] ?? 0) === 200, 'disabled: PUT route registered');
$delMatch = $router->match(new Request('DELETE', '/api/v1/admin/projects/1'));
assert_true(($delMatch['status'] ?? 0) === 200, 'disabled: DELETE route registered');
$pubMatch = $router->match(new Request('POST', '/api/v1/admin/projects/1/publish'));
assert_true(($pubMatch['status'] ?? 0) === 200, 'disabled: publish route registered');
$reMatch = $router->match(new Request('POST', '/api/v1/admin/projects/reorder'));
assert_true(($reMatch['status'] ?? 0) === 200, 'disabled: reorder route registered');

$outList = SoftPluginGate::outcome($registry, 'projects', 'GET', false);
assert_true($outList !== null && ($outList['status'] ?? 0) === 200, 'disabled GET list → 200 empty');
assert_true(($outList['body']['data'] ?? null) === [], 'disabled GET list empty collection');

$outItem = SoftPluginGate::outcome($registry, 'projects', 'GET', true);
assert_true($outItem !== null && ($outItem['status'] ?? 0) === 404, 'disabled GET item → 404');

foreach ([['POST', false], ['PUT', true], ['DELETE', true], ['POST', true]] as [$method, $isItem]) {
    $out = SoftPluginGate::outcome($registry, 'projects', $method, $isItem);
    assert_true($out !== null && ($out['status'] ?? 0) === 409, "disabled $method → 409");
    assert_true(($out['body']['code'] ?? '') === 'plugin_disabled', "disabled $method code plugin_disabled");
}

// Enable projects — soft gate passes (handlers would run)
$pdo->exec("UPDATE modules SET is_enabled=1 WHERE name='projects'");
$registryEnabled = new ModuleRegistry($db, $app, $modulesPath);
$registryEnabled->register(new ProjectsModule());
$pass = SoftPluginGate::outcome($registryEnabled, 'projects', 'GET', false);
assert_true($pass === null, 'enabled projects: soft gate passes to normal handlers');
$passMut = SoftPluginGate::outcome($registryEnabled, 'projects', 'POST', false);
assert_true($passMut === null, 'enabled projects: mutations pass to normal handlers');

// ContentModule alone must not own admin Projects CRUD
$contentOnly = new ModuleRegistry($db, $app, $modulesPath);
$contentOnly->register(new ContentModule());
$contentRouter = new Router();
$contentOnly->registerRoutes($contentRouter, $prefix);
$adminProj = $contentRouter->match(new Request('GET', '/api/v1/admin/projects'));
assert_true(($adminProj['status'] ?? 0) === 404, 'ContentModule does not register admin Projects CRUD');
$publicProj = $contentRouter->match(new Request('GET', '/api/v1/projects'));
assert_true(($publicProj['status'] ?? 0) === 200, 'ContentModule still registers public GET /projects');

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
