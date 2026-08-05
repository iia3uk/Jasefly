<?php
declare(strict_types=1);
/**
 * Behavior-parity PHP front controller for `php -S`.
 * Env: BEHAVIOR_PHP_DB, BEHAVIOR_PHP_STORAGE, BEHAVIOR_JWT_SECRET, BEHAVIOR_MCP_TOKEN
 */
$apiRoot = dirname(__DIR__, 2) . DIRECTORY_SEPARATOR . 'backend';
require_once $apiRoot . '/src/Bootstrap.php';
\App\Bootstrap::registerAutoload();

$dbPath = getenv('BEHAVIOR_PHP_DB') ?: '';
$storage = getenv('BEHAVIOR_PHP_STORAGE') ?: ($apiRoot . '/storage');
if ($dbPath === '' || !is_file($dbPath)) {
    http_response_code(500);
    header('Content-Type: application/json');
    echo json_encode(['success' => false, 'error' => 'BEHAVIOR_PHP_DB missing']);
    exit;
}

$app = require $apiRoot . '/config/app.php';
$app['jwt_secret'] = getenv('BEHAVIOR_JWT_SECRET') ?: 'behavior-parity-secret-32chars!!';
$app['mcp_api_token'] = getenv('BEHAVIOR_MCP_TOKEN') ?: 'behavior-mcp-token';
$app['storage'] = $storage;
$app['env'] = 'test';
$app['url'] = getenv('BEHAVIOR_PHP_URL') ?: 'http://127.0.0.1:3082';

use App\Database;
use App\Core\ModuleRegistry;
use App\Core\Container;
use App\Router;
use App\Request;
use App\Middleware\CorsMiddleware;
use App\Middleware\SecurityHeadersMiddleware;

$ref = new ReflectionClass(Database::class);
if ($ref->hasProperty('instance')) {
    $prop = $ref->getProperty('instance');
    $prop->setAccessible(true);
    $prop->setValue(null, null);
}

$db = Database::get([
    'driver' => 'sqlite',
    'path' => $dbPath,
]);

$container = Container::getInstance();
$container->set('app', $app);
$container->set('db', $db);
$access = \App\Platform\Access\AccessHost::boot($db);
$container->set(\App\Platform\Contracts\PlatformAccessInterface::class, $access);
$container->set(\App\Platform\Access\AccessService::class, $access);

$registry = new ModuleRegistry($db, $app, $apiRoot . '/src/Modules');
$container->set(\App\Core\EventDispatcher::class, $registry->events());
$registry->discover();
try {
    $registry->boot();
} catch (Throwable $e) {
    // continue
}
$container->set(ModuleRegistry::class, $registry);

$router = new Router();
$router->middleware(new CorsMiddleware($app));
$router->middleware(new SecurityHeadersMiddleware());
foreach ($registry->globalMiddleware() as $mw) {
    $router->middleware($mw);
}
foreach (['/api/v1', '/api'] as $prefix) {
    $registry->registerRoutes($router, $prefix);
}

$req = Request::fromGlobals();
$router->dispatch($req);
