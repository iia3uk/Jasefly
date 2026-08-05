<?php
declare(strict_types=1);

/**
 * Dump live PHP Router registrations into contracts/baseline/routes.v1.json
 * Usage:
 *   php -d extension_dir=... -d extension=pdo_sqlite scripts/contracts/extract-php-routes.php
 *   ... --check
 */

$root = dirname(__DIR__, 2);
require_once $root . '/backend/src/Bootstrap.php';
\App\Bootstrap::registerAutoload();
require_once $root . '/backend/tests/helpers.php';

use App\Core\ModuleRegistry;
use App\Middleware\AuthMiddleware;
use App\Middleware\PermissionMiddleware;
use App\Middleware\RateLimitMiddleware;
use App\Middleware\SoftRateLimitMiddleware;
use App\Router;
use App\Services\PermissionService;

$check = in_array('--check', $argv, true);
$outPath = $root . '/contracts/baseline/routes.v1.json';

if (!extension_loaded('pdo_sqlite')) {
    fwrite(STDERR, "pdo_sqlite required (enable via php -d extension=pdo_sqlite)\n");
    exit(2);
}

$ctx = jasefly_test_sqlite_boot();
$db = $ctx['db'];
$app = [
    'name' => 'JaseflyExtract',
    'url' => 'http://localhost',
    'env' => 'test',
    'jwt_secret' => 'extract-baseline-secret-32chars!!',
    'jwt_ttl' => 3600,
    'refresh_ttl' => 86400,
    'storage' => $ctx['storageDir'],
    'version' => '1.0.0',
    'mcp_api_token' => 'extract-mcp',
    'api' => ['versions' => ['/api/v1']],
    'modules' => ['auto_discover' => true],
];

$registry = (new ModuleRegistry($db, $app, $root . '/backend/src/Modules'))->discover();
try {
    $registry->boot();
} catch (Throwable $e) {
    fwrite(STDERR, 'warn boot: ' . $e->getMessage() . "\n");
}
$perms = new PermissionService($db);

$refReg = new ReflectionClass($registry);
$modulesProp = $refReg->getProperty('modules');
$modulesProp->setAccessible(true);
/** @var list<\App\Core\Contract\ModuleInterface> $modules */
$modules = $modulesProp->getValue($registry);

$routes = [];
foreach ($modules as $module) {
    $router = new Router();
    try {
        $module->registerRoutes($router, $db, $app, '/api/v1');
    } catch (Throwable $e) {
        fwrite(STDERR, "warn: {$module->name()}: {$e->getMessage()}\n");
        continue;
    }
    $ref = new ReflectionClass($router);
    $prop = $ref->getProperty('routes');
    $prop->setAccessible(true);
    /** @var list<array{method:string,path:string,handler:callable,middleware:list}> $raw */
    $raw = $prop->getValue($router);
    foreach ($raw as $r) {
        $auth = 'public';
        $hasPerm = false;
        $rate = false;
        $softRate = false;
        $mwNames = [];
        foreach ($r['middleware'] as $m) {
            if (!is_object($m)) {
                continue;
            }
            $mwNames[] = basename(str_replace('\\', '/', $m::class));
            if ($m instanceof AuthMiddleware) {
                $auth = 'auth';
            }
            if ($m instanceof PermissionMiddleware) {
                $hasPerm = true;
            }
            if ($m instanceof RateLimitMiddleware) {
                $rate = true;
            }
            if ($m instanceof SoftRateLimitMiddleware) {
                $softRate = true;
            }
        }
        $logical = preg_replace('#^/api/v1#', '', $r['path']) ?: '/';
        if ($auth === 'auth' || str_contains($r['path'], '/admin/')) {
            // keep
        } else {
            $auth = 'public';
        }
        if (str_contains($r['path'], '/admin/') && $auth === 'public') {
            $auth = 'auth';
        }
        $perm = ($hasPerm || str_contains($r['path'], '/admin/'))
            ? $perms->capabilityForAdminPath($r['path'])
            : null;
        $routes[] = [
            'id' => strtoupper($r['method']) . ' ' . $logical,
            'method' => strtoupper($r['method']),
            'path' => $logical,
            'full_path' => $r['path'],
            'module' => $module->name(),
            'authentication' => $auth,
            'permission' => $perm,
            'permission_middleware' => $hasPerm,
            'rate_limit' => $rate,
            'soft_rate_limit' => $softRate,
            'middleware' => array_values(array_unique($mwNames)),
            'request_schema' => null,
            'response_schema' => null,
            'http_statuses' => $auth === 'auth' ? [200, 401, 403, 404] : [200, 404],
            'error_codes' => [],
            'database_tables' => [],
            'events' => [],
            'side_effects' => [],
            'capabilities' => [],
            'baseline' => true,
            'node_status' => 'pending',
        ];
    }
}

usort($routes, static fn ($a, $b) => strcmp($a['id'], $b['id']));
$dedup = [];
foreach ($routes as $r) {
    $dedup[$r['id']] = $r;
}
$routes = array_values($dedup);

$doc = [
    'schema_version' => 1,
    'generated_at' => gmdate('c'),
    'generator' => 'scripts/contracts/extract-php-routes.php',
    'prefix' => '/api/v1',
    'alias_prefix' => '/api',
    'route_count' => count($routes),
    'modules' => array_values(array_unique(array_map(static fn ($r) => $r['module'], $routes))),
    'routes' => $routes,
];

($ctx['cleanup'])();

$json = json_encode($doc, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES) . "\n";

if ($check) {
    if (!is_file($outPath)) {
        fwrite(STDERR, "baseline missing: $outPath\n");
        exit(1);
    }
    $existing = json_decode((string) file_get_contents($outPath), true);
    $norm = static function ($list) {
        $out = [];
        foreach ($list ?? [] as $r) {
            unset($r['node_status']);
            $out[] = $r;
        }
        return $out;
    };
    if (json_encode($norm($existing['routes'] ?? null)) !== json_encode($norm($doc['routes']))) {
        fwrite(STDERR, "baseline drift: PHP routes ≠ contracts/baseline/routes.v1.json\n");
        fwrite(STDERR, 'committed=' . count($existing['routes'] ?? []) . ' live=' . count($doc['routes']) . "\n");
        exit(1);
    }
    echo 'baseline routes check OK (' . count($doc['routes']) . " routes)\n";
    exit(0);
}

@mkdir(dirname($outPath), 0775, true);
file_put_contents($outPath, $json);
echo "Wrote {$outPath} ({$doc['route_count']} routes, " . count($doc['modules']) . " modules)\n";
