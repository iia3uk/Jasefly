<?php
declare(strict_types=1);

/**
 * Demo Sandbox isolation — security regressions.
 */

use App\Jwt;
use App\Modules\Demo\DemoCapabilityPolicy;
use App\Modules\Demo\DemoContext;
use App\Modules\Demo\DemoContextHolder;
use App\Modules\Demo\DemoOverlayStore;
use App\Modules\Demo\DemoResponseSanitizer;
use App\Modules\Demo\DemoRoutePolicy;
use App\Modules\Demo\DemoSeedService;
use App\Modules\Demo\DemoSessionService;
use App\Request;
use App\Services\PermissionService;
use App\Support\SecretRedactor;

echo "Demo sandbox policy (no DB)\n";

assert_true(DemoRoutePolicy::decide('POST', '/api/v1/admin/updates') === DemoRoutePolicy::DENY, 'updates denied');
assert_true(DemoRoutePolicy::decide('POST', '/api/v1/admin/modules/foo/install') === DemoRoutePolicy::DENY, 'module install denied');
assert_true(DemoRoutePolicy::decide('POST', '/api/v1/admin/migrations/retry') === DemoRoutePolicy::DENY, 'migrations denied');
assert_true(DemoRoutePolicy::decide('PUT', '/api/v1/admin/users/1') === DemoRoutePolicy::DENY, 'users write denied');
assert_true(DemoRoutePolicy::decide('GET', '/api/v1/admin/pages/900001') === DemoRoutePolicy::INTERACTIVE, 'demo pages interactive');
assert_true(DemoRoutePolicy::decide('GET', '/api/v1/admin/page-templates') === DemoRoutePolicy::PREVIEW, 'page-templates preview');
assert_true(DemoRoutePolicy::decide('POST', '/api/v1/admin/page-templates/ensure') === DemoRoutePolicy::PREVIEW, 'page-templates ensure noop preview');
assert_true(DemoRoutePolicy::decide('GET', '/api/v1/admin/users') === DemoRoutePolicy::PREVIEW, 'users preview');
assert_true(DemoRoutePolicy::decide('GET', '/api/v1/admin/unknown-xyz') === DemoRoutePolicy::PREVIEW, 'unknown admin GET preview');
assert_true(DemoRoutePolicy::decide('POST', '/api/v1/admin/unknown-xyz') === DemoRoutePolicy::DENY, 'unknown admin write deny');
assert_true(DemoRoutePolicy::decide('GET', '/api/v1/admin/plugins') === DemoRoutePolicy::PREVIEW, 'plugins GET preview');
assert_true(DemoRoutePolicy::decide('POST', '/api/v1/admin/plugins') === DemoRoutePolicy::DENY, 'plugins write deny');
assert_true(DemoRoutePolicy::decide('GET', '/api/v1/admin/module-operations') === DemoRoutePolicy::PREVIEW, 'module-operations GET preview');
assert_true(DemoRoutePolicy::decide('GET', '/api/v1/admin/updates') === DemoRoutePolicy::PREVIEW, 'updates GET preview status');
assert_true(DemoRoutePolicy::decide('POST', '/api/v1/admin/updates') === DemoRoutePolicy::DENY, 'updates write deny');
assert_true(DemoRoutePolicy::decide('GET', '/api/v1/admin/activity') === DemoRoutePolicy::PREVIEW, 'activity GET preview');
assert_true(DemoRoutePolicy::decide('GET', '/api/v1/admin/translate/status') === DemoRoutePolicy::PREVIEW, 'translate status preview');
assert_true(DemoRoutePolicy::decide('GET', '/api/v1/admin/contact-messages') === DemoRoutePolicy::PREVIEW, 'contact-messages preview');
assert_true(DemoRoutePolicy::decide('GET', '/api/v1/admin/statistics') === DemoRoutePolicy::PREVIEW, 'statistics list preview');
assert_true(DemoRoutePolicy::decide('GET', '/api/v1/admin/mcp') === DemoRoutePolicy::DENY, 'mcp still hard deny');
assert_true(DemoRoutePolicy::decide('GET', '/api/v1/admin/migrations') === DemoRoutePolicy::PREVIEW, 'migrations GET preview');
assert_true(DemoRoutePolicy::decide('POST', '/api/v1/admin/migrations/retry') === DemoRoutePolicy::DENY, 'migrations write deny');
assert_true(DemoRoutePolicy::decide('GET', '/api/v1/admin/comments') === DemoRoutePolicy::PREVIEW, 'comments GET preview');
assert_true(DemoRoutePolicy::decide('GET', '/api/v1/admin/support/tickets') === DemoRoutePolicy::PREVIEW, 'support GET preview');
assert_true(DemoRoutePolicy::decide('GET', '/api/v1/admin/analytics/overview') === DemoRoutePolicy::PREVIEW, 'analytics GET preview');
assert_true(DemoRoutePolicy::decide('GET', '/api/v1/auth/me') === DemoRoutePolicy::PASS, 'auth/me pass');
assert_true(DemoRoutePolicy::decide('POST', '/api/v1/auth/demo/start') === DemoRoutePolicy::PASS, 'demo start pass');

assert_true(DemoCapabilityPolicy::allows('builder.use') === true, 'builder.use allowed');
assert_true(DemoCapabilityPolicy::allows('system.updates') === false, 'system.updates denied');
assert_true(DemoCapabilityPolicy::allows('users.delete') === false, 'users.delete denied');
assert_true(DemoCapabilityPolicy::allows('roles.manage') === false, 'roles.manage denied');
assert_true(DemoCapabilityPolicy::allows('totally.unknown.cap') === false, 'unknown cap denied');

$demoUser = ['sub' => -1, 'role' => 'demo_explorer', 'is_demo' => true, 'auth' => 'demo', 'type' => 'demo_access'];
assert_true(DemoCapabilityPolicy::allows('builder.use') === true, 'demo can builder.use');
assert_true(DemoCapabilityPolicy::allows('system.updates') === false, 'demo cannot system.updates');
assert_true(DemoCapabilityPolicy::allows('access.manage') === false, 'demo cannot access.manage');
assert_true(!empty($demoUser['is_demo']), 'demo user flagged');

$dirty = [
    'password_hash' => 'secret',
    'smtp_password' => 'x',
    'mcp_api_token' => 'tok',
    'nested' => ['api_key' => 'k', 'ok' => 'yes'],
    'path' => '/home/p/secret/config.php',
];
$clean = DemoResponseSanitizer::sanitize($dirty);
// access_token must remain usable when present in auth payloads
$withTok = DemoResponseSanitizer::sanitize(['access_token' => 'eyJhbGciOi.test.token', 'password_hash' => 'x']);
assert_true(($withTok['access_token'] ?? '') === 'eyJhbGciOi.test.token', 'access_token not redacted');
assert_true(($withTok['password_hash'] ?? '') === '***', 'password_hash still redacted');

assert_true(($clean['password_hash'] ?? '') === '***', 'redact password_hash');
assert_true(($clean['smtp_password'] ?? '') === '***', 'redact smtp_password');
assert_true(($clean['mcp_api_token'] ?? '') === '***', 'redact mcp token');
assert_true(($clean['nested']['api_key'] ?? '') === '***', 'redact nested api_key');
assert_true(($clean['nested']['ok'] ?? '') === 'yes', 'keep non-secret');
assert_true(str_contains((string) ($clean['path'] ?? ''), '[path]') || ($clean['path'] ?? '') === '[path]', 'scrub server path');

$jwtSecret = 'demo-sandbox-test-secret';
$demoJwt = Jwt::encode([
    'sub' => -1,
    'type' => 'demo_access',
    'is_demo' => true,
    'demo_sid' => 'abc',
    'role' => 'demo_explorer',
    'exp' => time() + 600,
], $jwtSecret);
$decoded = Jwt::decode($demoJwt, $jwtSecret);
assert_true(($decoded['type'] ?? '') === 'demo_access', 'demo JWT type');
assert_true(!empty($decoded['is_demo']), 'demo JWT flag');
assert_true(($decoded['role'] ?? '') !== 'super_admin', 'demo JWT not super');

// Seed files + IDOR ranges (no DB)
$seedPages = json_decode((string) file_get_contents(dirname(__DIR__) . '/src/Modules/Demo/seed/pages.json'), true);
assert_true(is_array($seedPages) && count($seedPages) >= 1, 'seed pages.json loads');
assert_true((int) ($seedPages[0]['id'] ?? 0) >= 900000, 'seed page ids in demo range');
foreach ($seedPages as $sp) {
    assert_true((int) ($sp['id'] ?? 0) < 910000, 'seed page id not colliding with media range');
}

// In-memory overlay seed → mutate → reset cycle (no PDO)
$mem = [];
$memPut = static function (string $sid, string $type, string $key, array $payload) use (&$mem): void {
    $mem["$sid|$type|$key"] = $payload;
};
$memGet = static function (string $sid, string $type, string $key) use (&$mem): ?array {
    return $mem["$sid|$type|$key"] ?? null;
};
$memClear = static function (string $sid) use (&$mem): void {
    foreach (array_keys($mem) as $k) {
        if (str_starts_with($k, $sid . '|')) {
            unset($mem[$k]);
        }
    }
};
$sidMem = 'mem-session';
foreach ($seedPages as $sp) {
    $memPut($sidMem, 'page', (string) $sp['id'], $sp);
}
$edited = $memGet($sidMem, 'page', '900001');
$edited['title'] = 'Edited in demo';
$memPut($sidMem, 'page', '900001', $edited);
assert_true(($memGet($sidMem, 'page', '900001')['title'] ?? '') === 'Edited in demo', 'memory overlay mutation');
$memClear($sidMem);
foreach ($seedPages as $sp) {
    $memPut($sidMem, 'page', (string) $sp['id'], $sp);
}
assert_true(($memGet($sidMem, 'page', '900001')['title'] ?? '') === 'Demo Home', 'memory reset restores seed');
assert_true($memGet($sidMem, 'page', '1') === null, 'memory store has no production page id');

if (!extension_loaded('pdo_sqlite')) {
    echo "  SKIP DemoSandbox PDO DB tests (pdo_sqlite missing)\n";
    return;
}

require_once __DIR__ . '/helpers.php';
$boot = jasefly_test_sqlite_boot();
$db = $boot['db'];
$apply = $boot['applyFile'];
$backendRoot = dirname(__DIR__);

try {
    $apply("$backendRoot/migrations/001_schema.sql");
    $apply("$backendRoot/migrations/002_enterprise.sql");
    $apply("$backendRoot/migrations/025_demo_sandbox.sql");
} catch (Throwable $e) {
    assert_true(false, 'demo migrations apply: ' . $e->getMessage());
    $boot['cleanup']();
    return;
}

$store = new DemoOverlayStore($db);
$seed = new DemoSeedService($store, $backendRoot . '/src/Modules/Demo/seed');
$sessions = new DemoSessionService($db, ['jwt_secret' => $jwtSecret, 'storage' => $boot['storageDir']], $store, $seed, $boot['storageDir']);

$_SERVER['REMOTE_ADDR'] = '127.0.0.1';
$req = new Request('POST', '/api/v1/auth/demo/start');
$started = $sessions->start($req);
assert_true(!empty($started['access_token']), 'demo start token');
assert_true(($started['user']['is_super'] ?? true) === false, 'demo user not super');
assert_true(!isset($started['refresh_token']), 'no production refresh token');
$sid = (string) $started['session_id'];

$page = $store->get($sid, 'page', '900001');
assert_true(is_array($page) && ($page['id'] ?? 0) == 900001, 'seed page present');

// Mutate overlay
$page['title'] = 'Edited in demo';
$store->put($sid, 'page', '900001', $page);
assert_true(($store->get($sid, 'page', '900001')['title'] ?? '') === 'Edited in demo', 'overlay mutation');

$sessions->reset($sid);
assert_true(($store->get($sid, 'page', '900001')['title'] ?? '') === 'Demo Home', 'reset restores seed');

// IDOR: production-like id must not be in store
assert_true($store->get($sid, 'page', '1') === null, 'no production page id in overlay');

// Expired cleanup
$db->run("UPDATE demo_sessions SET expires_at = datetime('now', '-1 hour') WHERE id=?", [$sid]);
$removed = $sessions->cleanupExpired();
assert_true($removed >= 1, 'cleanup removes expired');
assert_true($store->get($sid, 'page', '900001') === null, 'overlays gone after cleanup');

// PermissionService with demo context
DemoContextHolder::set(new DemoContext('x'));
$permSvc = new PermissionService($db);
assert_true($permSvc->can(['sub' => -1, 'is_demo' => true, 'role' => 'demo_explorer'], 'pages.manage') === true, 'PermissionService demo allow');
assert_true($permSvc->can(['sub' => -1, 'is_demo' => true, 'role' => 'demo_explorer'], 'system.updates') === false, 'PermissionService demo deny updates');
// Even if role forged as super_admin, is_demo wins
assert_true($permSvc->can(['sub' => -1, 'is_demo' => true, 'role' => 'super_admin'], 'system.updates') === false, 'forged super_admin still denied');
DemoContextHolder::clear();

assert_true(in_array('password_hash', SecretRedactor::DEMO_KEYS, true), 'SecretRedactor has DEMO_KEYS');

$boot['cleanup']();
echo "Demo sandbox DB tests done\n";
