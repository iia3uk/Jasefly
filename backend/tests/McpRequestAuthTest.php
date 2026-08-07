<?php
declare(strict_types=1);

/**
 * MCP dual-secret auth: require mode, signature, replay, skew, IP, JWT path untouched.
 */

use App\Core\Container;
use App\Jwt;
use App\Middleware\AuthMiddleware;
use App\Request;
use App\Support\McpRequestAuth;

$tmpStorage = sys_get_temp_dir() . DIRECTORY_SEPARATOR . 'jasefly_mcp_nonces_' . bin2hex(random_bytes(4));
@mkdir($tmpStorage . DIRECTORY_SEPARATOR . 'mcp_nonces', 0750, true);

$mcpToken = 'tok-test-mcp-dual-secret';
$signSecret = 'sign-test-hmac-secret-value';

/** @var array<string, mixed> $appRequire */
$appRequire = [
    'mcp_api_token' => $mcpToken,
    'mcp_signing_secret' => $signSecret,
    'mcp_auth_mode' => 'require',
    'mcp_skew_seconds' => 300,
    'mcp_allowed_ips' => '',
    'storage' => $tmpStorage,
    'url' => 'https://example.test',
];

$sign = static function (string $method, string $path, string $ts, string $nonce, string $body = '') use ($signSecret): string {
    $bodyHash = hash('sha256', $body);
    $canonical = McpRequestAuth::canonical($method, $path, $ts, strtolower($nonce), $bodyHash);
    return 'v1=' . hash_hmac('sha256', $canonical, $signSecret);
};

$clearMcpHeaders = static function (): void {
    unset(
        $_SERVER['HTTP_AUTHORIZATION'],
        $_SERVER['HTTP_X_JASEFLY_TS'],
        $_SERVER['HTTP_X_JASEFLY_NONCE'],
        $_SERVER['HTTP_X_JASEFLY_SIGN'],
        $_SERVER['CONTENT_TYPE'],
        $_SERVER['HTTP_ORIGIN']
    );
    $_SERVER['REMOTE_ADDR'] = '127.0.0.1';
};

// —— Bearer only + require → reject ——
$clearMcpHeaders();
$_SERVER['HTTP_AUTHORIZATION'] = 'Bearer ' . $mcpToken;
$rUnsigned = new Request('GET', '/api/v1/admin/system/status');
$resUnsigned = McpRequestAuth::authenticate($rUnsigned, $appRequire);
assert_true($resUnsigned['status'] === 'rejected', 'require mode rejects unsigned MCP Bearer');
assert_true(($resUnsigned['reason'] ?? '') === 'signature_required', 'require reason is signature_required');

// —— legacy accepts unsigned ——
$appLegacy = $appRequire;
$appLegacy['mcp_auth_mode'] = 'legacy';
$resLegacy = McpRequestAuth::authenticate($rUnsigned, $appLegacy);
assert_true($resLegacy['status'] === 'authenticated', 'legacy mode accepts unsigned MCP Bearer');

// —— empty signing secret forces legacy even if mode=require ——
$appNoSign = $appRequire;
$appNoSign['mcp_signing_secret'] = '';
$resNoSign = McpRequestAuth::authenticate($rUnsigned, $appNoSign);
assert_true($resNoSign['status'] === 'authenticated', 'empty signing secret forces legacy accept');

// —— valid signature → pass ——
$clearMcpHeaders();
$path = '/api/v1/admin/system/status';
$ts = (string) time();
$nonce = bin2hex(random_bytes(16));
$_SERVER['HTTP_AUTHORIZATION'] = 'Bearer ' . $mcpToken;
$_SERVER['HTTP_X_JASEFLY_TS'] = $ts;
$_SERVER['HTTP_X_JASEFLY_NONCE'] = $nonce;
$_SERVER['HTTP_X_JASEFLY_SIGN'] = $sign('GET', $path, $ts, $nonce);
$rOk = new Request('GET', $path);
$resOk = McpRequestAuth::authenticate($rOk, $appRequire);
assert_true($resOk['status'] === 'authenticated', 'valid HMAC signature authenticates');
assert_true(($resOk['user']['auth'] ?? '') === 'mcp_token', 'MCP user auth=mcp_token');

// —— replay same nonce → fail ——
$rReplay = new Request('GET', $path);
$resReplay = McpRequestAuth::authenticate($rReplay, $appRequire);
assert_true($resReplay['status'] === 'rejected', 'replayed nonce rejected');
assert_true(($resReplay['reason'] ?? '') === 'replay', 'replay reason');

// —— bad signature → fail ——
$clearMcpHeaders();
$ts2 = (string) time();
$nonce2 = bin2hex(random_bytes(16));
$_SERVER['HTTP_AUTHORIZATION'] = 'Bearer ' . $mcpToken;
$_SERVER['HTTP_X_JASEFLY_TS'] = $ts2;
$_SERVER['HTTP_X_JASEFLY_NONCE'] = $nonce2;
$_SERVER['HTTP_X_JASEFLY_SIGN'] = 'v1=' . str_repeat('ab', 32);
$rBad = new Request('GET', $path);
$resBad = McpRequestAuth::authenticate($rBad, $appRequire);
assert_true($resBad['status'] === 'rejected', 'bad signature rejected');
assert_true(($resBad['reason'] ?? '') === 'bad_signature', 'bad_signature reason');

// —— skew too old → fail ——
$clearMcpHeaders();
$tsOld = (string) (time() - 900);
$nonce3 = bin2hex(random_bytes(16));
$_SERVER['HTTP_AUTHORIZATION'] = 'Bearer ' . $mcpToken;
$_SERVER['HTTP_X_JASEFLY_TS'] = $tsOld;
$_SERVER['HTTP_X_JASEFLY_NONCE'] = $nonce3;
$_SERVER['HTTP_X_JASEFLY_SIGN'] = $sign('GET', $path, $tsOld, $nonce3);
$rSkew = new Request('GET', $path);
$resSkew = McpRequestAuth::authenticate($rSkew, $appRequire);
assert_true($resSkew['status'] === 'rejected', 'stale timestamp rejected');
assert_true(($resSkew['reason'] ?? '') === 'skew', 'skew reason');

// —— IP allowlist ——
$appIp = $appRequire;
$appIp['mcp_allowed_ips'] = '10.0.0.0/8';
$clearMcpHeaders();
$_SERVER['REMOTE_ADDR'] = '127.0.0.1';
$_SERVER['HTTP_AUTHORIZATION'] = 'Bearer ' . $mcpToken;
$ts4 = (string) time();
$nonce4 = bin2hex(random_bytes(16));
$_SERVER['HTTP_X_JASEFLY_TS'] = $ts4;
$_SERVER['HTTP_X_JASEFLY_NONCE'] = $nonce4;
$_SERVER['HTTP_X_JASEFLY_SIGN'] = $sign('GET', $path, $ts4, $nonce4);
$rIp = new Request('GET', $path);
$resIp = McpRequestAuth::authenticate($rIp, $appIp);
assert_true($resIp['status'] === 'rejected', 'IP outside allowlist rejected');
assert_true(($resIp['reason'] ?? '') === 'ip_denied', 'ip_denied reason');

assert_true(McpRequestAuth::ipAllowed('10.1.2.3', '10.0.0.0/8') === true, 'CIDR allow matches');
assert_true(McpRequestAuth::ipAllowed('127.0.0.1', '127.0.0.1') === true, 'exact IP allow matches');

// —— Wrong bearer → skip (JWT path) ——
$clearMcpHeaders();
$_SERVER['HTTP_AUTHORIZATION'] = 'Bearer not-the-mcp-token';
$rSkip = new Request('GET', $path);
$resSkip = McpRequestAuth::authenticate($rSkip, $appRequire);
assert_true($resSkip['status'] === 'skip', 'non-MCP bearer skips MCP auth');

// —— AuthMiddleware JWT editor session unaffected ——
$jwtSecret = 'jwt-test-secret-for-mcp-dual';
$container = Container::getInstance();
$container->set('app', [
    'mcp_api_token' => $mcpToken,
    'mcp_signing_secret' => $signSecret,
    'mcp_auth_mode' => 'require',
    'storage' => $tmpStorage,
]);
$editorJwt = Jwt::encode([
    'sub' => 42,
    'email' => 'editor@example.test',
    'role' => 'editor',
    'type' => 'access',
    'exp' => time() + 600,
], $jwtSecret);
$clearMcpHeaders();
$_SERVER['HTTP_AUTHORIZATION'] = 'Bearer ' . $editorJwt;
$reqJwt = new Request('GET', '/api/v1/admin/me');
$mw = new AuthMiddleware($jwtSecret);
$jwtOk = false;
$mw($reqJwt, static function () use (&$jwtOk, $reqJwt): mixed {
    $jwtOk = (($reqJwt->user['role'] ?? '') === 'editor')
        && (($reqJwt->user['auth'] ?? '') !== 'mcp_token');
    return null;
});
assert_true($jwtOk === true, 'JWT editor session unaffected by MCP require mode');

// —— mcpStatus fields (no secrets) ——
$healthSrc = (string) file_get_contents(dirname(__DIR__) . '/src/Services/SystemHealthService.php');
assert_true(str_contains($healthSrc, 'signing_configured'), 'mcpStatus exposes signing_configured');
assert_true(str_contains($healthSrc, 'auth_mode'), 'mcpStatus exposes auth_mode');
assert_true(str_contains($healthSrc, 'ip_allowlist_enabled'), 'mcpStatus exposes ip_allowlist_enabled');
assert_true(!str_contains($healthSrc, 'token_hint'), 'mcpStatus still has no token_hint');

$authSrc = (string) file_get_contents(dirname(__DIR__) . '/src/Support/McpRequestAuth.php');
assert_true(str_contains($authSrc, 'claimNonce'), 'McpRequestAuth implements nonce claim');

$migrationListed = str_contains(
    (string) file_get_contents(dirname(__DIR__) . '/src/Services/MigrationService.php'),
    '030_mcp_nonces.sql'
);
assert_true($migrationListed, 'MigrationService lists 030_mcp_nonces.sql');
assert_true(is_file(dirname(__DIR__) . '/migrations/030_mcp_nonces.sql'), '030_mcp_nonces.sql exists');

$clientSrc = (string) file_get_contents(dirname(__DIR__, 2) . '/mcp-cms/src/client.js');
assert_true(str_contains($clientSrc, 'buildMcpSignature'), 'mcp-cms client exports buildMcpSignature');
assert_true(str_contains($clientSrc, 'X-Jasefly-Sign'), 'mcp-cms client sends X-Jasefly-Sign');

$clearMcpHeaders();

// Cleanup temp nonce store
foreach (glob($tmpStorage . DIRECTORY_SEPARATOR . 'mcp_nonces' . DIRECTORY_SEPARATOR . '*') ?: [] as $f) {
    @unlink($f);
}
@rmdir($tmpStorage . DIRECTORY_SEPARATOR . 'mcp_nonces');
@rmdir($tmpStorage);
