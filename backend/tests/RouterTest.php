<?php
declare(strict_types=1);

/**
 * Router match semantics (404 vs 405, param decode) — no DB, no exit.
 */

use App\Request;
use App\Router;

$router = new Router();
$router->get('/api/v1/health', static function (): void {});
$router->get('/api/v1/items/{slug}', static function (): void {});
$router->post('/api/v1/items/{slug}', static function (): void {});

$getHealth = $router->match(new Request('GET', '/api/v1/health'));
assert_true(($getHealth['status'] ?? 0) === 200, 'GET /health matches');

$postHealth = $router->match(new Request('POST', '/api/v1/health'));
assert_true(($postHealth['status'] ?? 0) === 405, 'POST /health is 405 Method Not Allowed');
assert_true(in_array('GET', $postHealth['allow'] ?? [], true), '405 Allow includes GET');

$missing = $router->match(new Request('GET', '/api/v1/no-such-route'));
assert_true(($missing['status'] ?? 0) === 404, 'unknown path is 404');

$decoded = $router->match(new Request('GET', '/api/v1/items/hello%20world'));
assert_true(($decoded['status'] ?? 0) === 200, 'encoded slug path matches');
assert_true(($decoded['params']['slug'] ?? '') === 'hello world', 'route params are rawurldecoded');

$patchRouter = new Router();
$patchRouter->patch('/api/v1/x', static function (): void {});
$patchOk = $patchRouter->match(new Request('PATCH', '/api/v1/x'));
assert_true(($patchOk['status'] ?? 0) === 200, 'PATCH helper registers routes');

// Database::transaction contract (SQLite when available)
if (!extension_loaded('pdo_sqlite')) {
    echo "  SKIP Database::transaction (pdo_sqlite missing)\n";
} else {
    require_once __DIR__ . '/helpers.php';
    $ctx = jasefly_test_sqlite_boot();
    $db = $ctx['db'];
    $pdo = $ctx['pdo'];
    $pdo->exec('CREATE TABLE t_tx (id INTEGER PRIMARY KEY, v TEXT)');
    try {
        $db->transaction(static function () use ($db): void {
            $db->run("INSERT INTO t_tx (v) VALUES ('a')");
            throw new RuntimeException('rollback me');
        });
        assert_true(false, 'transaction should rethrow');
    } catch (RuntimeException $e) {
        assert_true($e->getMessage() === 'rollback me', 'transaction rethrows');
    }
    $count = (int) ($pdo->query('SELECT COUNT(*) c FROM t_tx')->fetch()['c'] ?? -1);
    assert_true($count === 0, 'failed transaction rolls back inserts');

    $db->transaction(static function () use ($db): void {
        $db->run("INSERT INTO t_tx (v) VALUES ('ok')");
    });
    $count2 = (int) ($pdo->query('SELECT COUNT(*) c FROM t_tx')->fetch()['c'] ?? -1);
    assert_true($count2 === 1, 'successful transaction commits');
    ($ctx['cleanup'])();
}

assert_true(method_exists(\App\Core\ModuleRegistry::class, 'recordLoadFailure'), 'recordLoadFailure API exists');
