<?php
declare(strict_types=1);

/**
 * API route contract: critical /api/v1 paths must be registered.
 * Does not execute handlers (Response::json exits).
 */

use App\Router;

$register = require dirname(__DIR__) . '/routes/api_v1.php';

if (!extension_loaded('pdo_sqlite')) {
    echo "  SKIP ApiRouteContract (pdo_sqlite missing)\n";
    return;
}

require_once __DIR__ . '/helpers.php';
$ctx = jasefly_test_sqlite_boot();
$db = $ctx['db'];
$app = [
    'jwt_secret' => 'test-secret-for-route-contract',
    'jwt_ttl' => 3600,
    'refresh_ttl' => 86400,
    'storage' => $ctx['storageDir'],
    'version' => '1.0.0',
];

$router = new Router();
try {
    $register($router, $db, $app, '/api/v1');
} catch (Throwable $e) {
    assert_true(false, 'api_v1 route registration: ' . $e->getMessage());
    ($ctx['cleanup'])();
    return;
}

$ref = new ReflectionClass($router);
$prop = $ref->getProperty('routes');
$prop->setAccessible(true);
/** @var list<array{method:string,path:string}> $routes */
$routes = $prop->getValue($router);

$index = [];
foreach ($routes as $route) {
    $index[$route['method'] . ' ' . $route['path']] = true;
}

$required = [
    'GET /api/v1/health',
    'GET /api/v1/site',
    'GET /api/v1/pages/{slug}',
    'GET /api/v1/search',
    'POST /api/v1/auth/login',
    'POST /api/v1/auth/refresh',
    'GET /api/v1/auth/me',
    'GET /api/v1/admin/dashboard',
    'GET /api/v1/admin/system/status',
    'GET /api/v1/admin/roles',
    'GET /api/v1/admin/permissions',
    'GET /api/v1/admin/pages',
];

foreach ($required as $key) {
    assert_true(isset($index[$key]), "route registered: {$key}");
}

assert_true(count($routes) >= 40, 'api_v1 registers a substantial route set (' . count($routes) . ')');

($ctx['cleanup'])();
