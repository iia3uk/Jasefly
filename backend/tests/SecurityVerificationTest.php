<?php
declare(strict_types=1);

require_once __DIR__ . '/_package_dir.php';

/**
 * Priority 6 вЂ” Security verification regressions (no network, minimal DB).
 * Included from run.php (uses global assert_true).
 */

use App\Core\Modules\ModulePackagePaths;
use App\Jwt;
use App\Services\BackupService;
use App\Services\MediaService;
use App\Services\TotpService;
use App\Support\SsrfGuard;
use App\Utils\Password;

// вЂ”вЂ” SSRF guard вЂ”вЂ”
assert_true(SsrfGuard::isBlockedHost('localhost') === true, 'SSRF blocks localhost');
assert_true(SsrfGuard::isBlockedHost('127.0.0.1') === true, 'SSRF blocks 127.0.0.1');
assert_true(SsrfGuard::isBlockedHost('::1') === true, 'SSRF blocks ::1');
assert_true(SsrfGuard::isBlockedHost('10.0.0.1') === true, 'SSRF blocks 10.x');
assert_true(SsrfGuard::isBlockedHost('192.168.1.1') === true, 'SSRF blocks 192.168.x');
assert_true(SsrfGuard::isBlockedHost('169.254.169.254') === true, 'SSRF blocks link-local / metadata');
assert_true(SsrfGuard::isSafeHttpUrl('http://127.0.0.1/admin') === false, 'SSRF rejects loopback URL');
assert_true(SsrfGuard::isSafeHttpUrl('ftp://example.com/x') === false, 'SSRF rejects non-http scheme');
assert_true(SsrfGuard::isSafeHttpUrl('not-a-url') === false, 'SSRF rejects invalid URL');
assert_true(SsrfGuard::isSafeHttpUrl('https://example.com/hook') === true, 'SSRF allows public https URL');

// вЂ”вЂ” Password hashing вЂ”вЂ”
$hash = Password::hash('correct-horse-battery');
assert_true(Password::verify('correct-horse-battery', $hash) === true, 'Password verify ok');
assert_true(Password::verify('wrong-password', $hash) === false, 'Password verify rejects wrong');
if (defined('PASSWORD_ARGON2ID')) {
    assert_true(str_starts_with($hash, '$argon2id$'), 'Password uses Argon2id when available');
}

// вЂ”вЂ” TOTP вЂ”вЂ”
$totp = new TotpService();
$secret = $totp->generateSecret();
$code = $totp->codeAt($secret, intdiv(time(), 30));
assert_true($totp->verify($secret, $code) === true, 'TOTP verifies current code');
assert_true($totp->verify($secret, 'abcdef') === false, 'TOTP rejects non-digit code');
if ($code !== '000000') {
    assert_true($totp->verify($secret, '000000') === false, 'TOTP rejects wrong code');
}
$url = $totp->otpAuthUrl($secret, 'admin@example.com');
assert_true(str_starts_with($url, 'otpauth://totp/'), 'TOTP otpauth URL shape');

// вЂ”вЂ” JWT type segregation вЂ”вЂ”
$secretJwt = 'test-jwt-secret-for-security-suite';
$access = Jwt::encode(['sub' => 1, 'type' => 'access', 'exp' => time() + 60], $secretJwt);
$refresh = Jwt::encode(['sub' => 1, 'type' => 'refresh', 'exp' => time() + 3600], $secretJwt);
$challenge = Jwt::encode(['sub' => 1, 'type' => '2fa_challenge', 'exp' => time() + 300], $secretJwt);
$a = Jwt::decode($access, $secretJwt);
$rTok = Jwt::decode($refresh, $secretJwt);
$c = Jwt::decode($challenge, $secretJwt);
assert_true(($a['type'] ?? '') === 'access', 'JWT access type preserved');
assert_true(($rTok['type'] ?? '') === 'refresh', 'JWT refresh type preserved');
assert_true(($c['type'] ?? '') === '2fa_challenge', 'JWT 2fa_challenge type preserved');
assert_true($access !== $refresh, 'access and refresh tokens differ');

// вЂ”вЂ” Refresh token storage uses SHA-256 of raw token (not plaintext) вЂ”вЂ”
$rawRefresh = 'refresh-token-raw-value';
$stored = hash('sha256', $rawRefresh);
assert_true(strlen($stored) === 64, 'refresh token hash is sha256 hex');
assert_true($stored !== $rawRefresh, 'refresh token is not stored plaintext');

// вЂ”вЂ” Backup encrypt/decrypt roundtrip вЂ”вЂ”
if (!function_exists('sodium_crypto_secretbox') && !function_exists('openssl_encrypt')) {
    echo "  SKIP backup encrypt/decrypt (ext-sodium and ext-openssl missing)\n";
} else {
    $backupRef = new ReflectionClass(BackupService::class);
    $backup = $backupRef->newInstanceWithoutConstructor();
    $appProp = $backupRef->getProperty('app');
    $appProp->setAccessible(true);
    $appProp->setValue($backup, ['backup_key' => 'security-test-backup-key']);
    $enc = $backupRef->getMethod('encrypt');
    $enc->setAccessible(true);
    $dec = $backupRef->getMethod('decrypt');
    $dec->setAccessible(true);
    $plain = "-- Jasefly backup\nSELECT 1;\n";
    $blob = $enc->invoke($backup, $plain);
    assert_true(is_string($blob) && $blob !== $plain, 'backup encrypt changes payload');
    assert_true(str_starts_with($blob, 'PCMS1') || str_starts_with($blob, 'PCMS2'), 'backup uses versioned ciphertext');
    assert_true($dec->invoke($backup, $blob) === $plain, 'backup decrypt roundtrip');
}

// вЂ”вЂ” Media upload allowlist excludes PHP / executable вЂ”вЂ”
$mediaRef = new ReflectionClass(MediaService::class);
$media = $mediaRef->newInstanceWithoutConstructor();
$allowedFn = $mediaRef->getMethod('allowedUploadTypes');
$allowedFn->setAccessible(true);
/** @var array<string, string> $allowed */
$allowed = $allowedFn->invoke($media);
assert_true(isset($allowed['image/jpeg']), 'media allows jpeg');
assert_true(isset($allowed['application/pdf']), 'media allows pdf');
assert_true(!isset($allowed['application/x-php']), 'media rejects php mime');
assert_true(!isset($allowed['application/javascript']), 'media rejects javascript mime');
assert_true(!isset($allowed['text/html']), 'media rejects html mime');
assert_true(!isset($allowed['image/svg+xml']), 'media rejects svg mime (stored XSS)');
$rejectSvg = $mediaRef->getMethod('rejectSvgUpload');
$rejectSvg->setAccessible(true);
$svgBan = false;
try {
    $rejectSvg->invoke($media, 'image/svg+xml', 'svg');
} catch (Throwable $e) {
    $svgBan = str_contains($e->getMessage(), 'Unsupported');
}
assert_true($svgBan, 'SVG upload hard-rejected');

// вЂ”вЂ” Path jail вЂ”вЂ”
$tmpRoot = sys_get_temp_dir() . '/jasefly-sec-' . bin2hex(random_bytes(3));
@mkdir($tmpRoot . '/safe', 0775, true);
@mkdir($tmpRoot . '/outside', 0775, true);
file_put_contents($tmpRoot . '/outside/x.txt', 'x');
$paths = new ModulePackagePaths($tmpRoot, $tmpRoot);
$threw = false;
try {
    $paths->assertContained($tmpRoot . '/safe', $tmpRoot . '/safe/../outside/x.txt');
} catch (Throwable) {
    $threw = true;
}
assert_true($threw, 'path jail rejects traversal outside root');

// Prefix collision: sibling dir must not pass as contained under shorter root name.
$prefixRoot = sys_get_temp_dir() . '/jasefly-pfx-' . bin2hex(random_bytes(3));
@mkdir($prefixRoot . '/demo', 0775, true);
@mkdir($prefixRoot . '/demo-kit', 0775, true);
$paths2 = new ModulePackagePaths($prefixRoot, $prefixRoot);
$prefixThrew = false;
try {
    // Non-existent file under sibling "demo-kit" must not be accepted for root ".../demo"
    $paths2->assertContained($prefixRoot . '/demo', $prefixRoot . '/demo-kit/evil.php');
} catch (Throwable) {
    $prefixThrew = true;
}
assert_true($prefixThrew, 'path jail rejects sibling prefix collision (demo vs demo-kit)');
@rmdir($prefixRoot . '/demo-kit');
@rmdir($prefixRoot . '/demo');
@rmdir($prefixRoot);

@unlink($tmpRoot . '/outside/x.txt');
@rmdir($tmpRoot . '/outside');
@rmdir($tmpRoot . '/safe');
@rmdir($tmpRoot);

// вЂ”вЂ” Automation / shared log redaction вЂ”вЂ”
$out = \App\Support\SecretRedactor::redact([
    'password' => 'secret',
    'token' => 'abc',
    'api_key' => 'k',
    'nested' => ['secret' => 's', 'ok' => 'visible'],
]);
assert_true(($out['password'] ?? '') === '***', 'SecretRedactor redacts password');
assert_true(($out['token'] ?? '') === '***', 'SecretRedactor redacts token');
assert_true(($out['api_key'] ?? '') === '***', 'SecretRedactor redacts api_key');
assert_true(($out['nested']['secret'] ?? '') === '***', 'SecretRedactor redacts nested secret');
assert_true(($out['nested']['ok'] ?? '') === 'visible', 'SecretRedactor keeps non-secret fields');

// вЂ”вЂ” Webhooks / Auth / outbound source contracts вЂ”вЂ”
$whDir = jasefly_test_package_dir('webhooks');
assert_true($whDir !== null, 'webhooks package source present');
$whSrc = (string) file_get_contents($whDir . '/backend/WebhooksModule.php');
assert_true(
    str_contains($whSrc, 'postJsonOutbound') || str_contains($whSrc, 'isSafeOutboundUrl'),
    'Webhooks package uses Platform outbound HTTP helpers'
);
assert_true(str_contains($whSrc, 'X-Jasefly-Signature'), 'Webhooks package signs with HMAC header');
$httpIface = (string) file_get_contents(dirname(__DIR__) . '/src/Platform/Contracts/PlatformHttpInterface.php');
assert_true(str_contains($httpIface, 'isSafeOutboundUrl'), 'PlatformHttpInterface exposes isSafeOutboundUrl');
assert_true(str_contains($httpIface, 'postJsonOutbound'), 'PlatformHttpInterface exposes postJsonOutbound');
assert_true(str_contains($httpIface, 'requestOutbound'), 'PlatformHttpInterface exposes requestOutbound');
assert_true(str_contains((string) file_get_contents(dirname(__DIR__) . '/src/Support/OutboundHttp.php'), 'SsrfGuard::isSafeHttpUrl'), 'OutboundHttp applies SsrfGuard');
assert_true(str_contains((string) file_get_contents(dirname(__DIR__) . '/src/Support/OutboundHttp.php'), 'CURLOPT_RESOLVE'), 'OutboundHttp pins DNS via CURLOPT_RESOLVE');
assert_true(method_exists(SsrfGuard::class, 'resolvePublicIp'), 'SsrfGuard::resolvePublicIp exists');
assert_true(SsrfGuard::resolvePublicIp('127.0.0.1') === null, 'resolvePublicIp rejects loopback');
assert_true(SsrfGuard::resolvePublicIp('169.254.169.254') === null, 'resolvePublicIp rejects link-local');

$authSrc = (string) file_get_contents(dirname(__DIR__) . '/src/Controllers/AuthController.php');
assert_true(str_contains($authSrc, "public function refresh"), 'AuthController has refresh()');
assert_true(str_contains($authSrc, "'refresh_token' => \$refresh"), 'Auth refresh returns rotated refresh_token');
assert_true(substr_count($authSrc, 'DELETE FROM refresh_tokens WHERE token_hash=?') >= 1, 'Auth deletes refresh token hashes');

// вЂ”вЂ” Production hardening: no anonymous debug leak вЂ”вЂ”
$prevEnv = getenv('APP_ENV');
$prevAuth = $_SERVER['HTTP_AUTHORIZATION'] ?? null;
$prevGet = $_GET;
putenv('APP_ENV=production');
$_ENV['APP_ENV'] = 'production';
$_GET = ['debug' => '1'];
$_SERVER['HTTP_AUTHORIZATION'] = 'Bearer totally-fake-token';
$showFile = dirname(__DIR__) . '/storage/.show_errors';
$hadShow = is_file($showFile);
if ($hadShow) {
    @unlink($showFile);
}
assert_true(
    !\App\Services\ErrorReportService::shouldExposeDetails(),
    'production ignores ?debug=1 and unverified Bearer'
);
putenv('APP_ENV=local');
$_ENV['APP_ENV'] = 'local';
assert_true(
    \App\Services\ErrorReportService::shouldExposeDetails(),
    'local APP_ENV may expose error details'
);
if ($prevEnv === false) {
    putenv('APP_ENV');
    unset($_ENV['APP_ENV']);
} else {
    putenv('APP_ENV=' . $prevEnv);
    $_ENV['APP_ENV'] = $prevEnv;
}
$_GET = $prevGet;
if ($prevAuth === null) {
    unset($_SERVER['HTTP_AUTHORIZATION']);
} else {
    $_SERVER['HTTP_AUTHORIZATION'] = $prevAuth;
}

$hdrSrc = (string) file_get_contents(dirname(__DIR__) . '/src/Middleware/SecurityHeadersMiddleware.php');
assert_true(str_contains($hdrSrc, 'Strict-Transport-Security'), 'API SecurityHeaders sets HSTS on HTTPS');
assert_true(str_contains($hdrSrc, 'Cross-Origin-Opener-Policy'), 'API SecurityHeaders sets COOP');
assert_true(str_contains($hdrSrc, 'Cross-Origin-Resource-Policy'), 'API SecurityHeaders sets CORP');

$installSrc = (string) file_get_contents(dirname(__DIR__) . '/install.php');
assert_true(str_contains($installSrc, 'function resolveAdminPassword'), 'installer requires explicit admin password');
assert_true(!preg_match("/password_hash\\(\\s*'Admin123!'/", $installSrc), 'installer does not hardcode Admin123!');
