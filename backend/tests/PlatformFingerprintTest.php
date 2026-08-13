<?php
declare(strict_types=1);

/**
 * Public platform fingerprint: PHP ↔ Node parity against contracts/platform-fingerprint.v1.json.
 * Included from run.php (uses global assert_true).
 */

use App\Request;
use App\Router;
use App\Support\PlatformFingerprint;

$repoRoot = dirname(__DIR__, 2);
$contractPath = $repoRoot . '/contracts/platform-fingerprint.v1.json';
assert_true(is_file($contractPath), 'platform-fingerprint contract exists');
$contract = json_decode((string) file_get_contents($contractPath), true);
assert_true(is_array($contract), 'platform-fingerprint contract is JSON');

assert_true(($contract['platform'] ?? '') === 'Jasefly', 'contract platform is Jasefly');
assert_true(($contract['http']['header'] ?? '') === 'X-Jasefly', 'contract HTTP header is X-Jasefly');
assert_true(($contract['http']['value'] ?? '') === '1', 'contract HTTP value is 1');
assert_true(($contract['http']['not_used'] ?? '') === 'X-Powered-By', 'contract does not use X-Powered-By');
assert_true(($contract['html']['meta_name'] ?? '') === 'generator', 'contract HTML meta name is generator');
assert_true(($contract['html']['meta_content'] ?? '') === 'Jasefly', 'contract HTML generator is Jasefly');
assert_true(($contract['well_known']['path'] ?? '') === '/.well-known/jasefly', 'contract well-known path');
assert_true(($contract['well_known']['body'] ?? null) === ['platform' => 'Jasefly'], 'contract well-known body');

$payload = PlatformFingerprint::payload();
assert_true($payload === $contract['well_known']['body'], 'PHP payload matches contract body');
assert_true(array_keys($payload) === ['platform'], 'PHP payload has only platform');
assert_true(PlatformFingerprint::HEADER_NAME === $contract['http']['header'], 'PHP header name matches contract');
assert_true(PlatformFingerprint::HEADER_VALUE === $contract['http']['value'], 'PHP header value matches contract');
assert_true(PlatformFingerprint::GENERATOR === $contract['html']['meta_content'], 'PHP generator matches contract');
assert_true(PlatformFingerprint::WELL_KNOWN_PATH === $contract['well_known']['path'], 'PHP well-known path matches contract');
assert_true(PlatformFingerprint::json() === '{"platform":"Jasefly"}', 'PHP JSON is minimal compact object');
assert_true(
    PlatformFingerprint::generatorMetaTag() === '<meta name="generator" content="Jasefly">',
    'PHP generator meta tag'
);
assert_true(PlatformFingerprint::isWellKnownPath('/.well-known/jasefly'), 'well-known path matches');
assert_true(PlatformFingerprint::isWellKnownPath('/.well-known/jasefly/'), 'well-known trailing slash matches');
assert_true(!PlatformFingerprint::isWellKnownPath('/.well-known/acme-challenge/x'), 'ACME path is not fingerprint');

$forbidden = $contract['well_known']['forbidden_keys'] ?? [];
assert_true(is_array($forbidden) && $forbidden !== [], 'contract lists forbidden JSON keys');
foreach ($forbidden as $key) {
    assert_true(!array_key_exists($key, $payload), "PHP payload omits forbidden key {$key}");
}

$router = new Router();
PlatformFingerprint::register($router);
$hit = $router->match(new Request('GET', '/.well-known/jasefly'));
assert_true(($hit['status'] ?? 0) === 200, 'GET /.well-known/jasefly is registered');
$post = $router->match(new Request('POST', '/.well-known/jasefly'));
assert_true(($post['status'] ?? 0) === 405, 'POST /.well-known/jasefly is 405');

$hardenSrc = (string) file_get_contents($repoRoot . '/backend/src/Support/RuntimeHardening.php');
assert_true(str_contains($hardenSrc, "ini_set('expose_php', '0')"), 'RuntimeHardening disables expose_php');
assert_true(str_contains($hardenSrc, "header_remove('X-Powered-By')"), 'RuntimeHardening removes X-Powered-By');
assert_true(!preg_match("/header\\(\\s*['\"]X-Powered-By:/", $hardenSrc), 'RuntimeHardening never re-sets X-Powered-By');

$probe = $repoRoot . '/backend/tests/runtime_hardening_probe.php';
$cmd = escapeshellarg(PHP_BINARY) . ' -d expose_php=1 ' . escapeshellarg($probe);
$probeOut = [];
$probeCode = 1;
exec($cmd . ' 2>&1', $probeOut, $probeCode);
assert_true($probeCode === 0, 'RuntimeHardening probe removes CGI X-Powered-By (' . implode(' ', $probeOut) . ')');

$userIni = (string) file_get_contents($repoRoot . '/backend/public/.user.ini');
assert_true(str_contains($userIni, 'expose_php = Off'), 'API .user.ini turns expose_php Off');
$rootUserIni = (string) file_get_contents($repoRoot . '/frontend/public/.user.ini');
assert_true(str_contains($rootUserIni, 'expose_php = Off'), 'document-root .user.ini turns expose_php Off');

$hdrSrc = (string) file_get_contents($repoRoot . '/backend/src/Middleware/SecurityHeadersMiddleware.php');
assert_true(str_contains($hdrSrc, 'RuntimeHardening::hidePhpFingerprint'), 'SecurityHeaders strips PHP fingerprint');
assert_true(!preg_match("/header\\(\\s*['\"]X-Powered-By:/", $hdrSrc), 'SecurityHeaders does not set X-Powered-By: Jasefly');

$indexSrc = (string) file_get_contents($repoRoot . '/backend/public/index.php');
assert_true(str_contains($indexSrc, 'PlatformFingerprint::register'), 'API front controller registers well-known once');

$phpRouter = (string) file_get_contents($repoRoot . '/scripts/behavior/php-router.php');
assert_true(str_contains($phpRouter, 'PlatformFingerprint::register'), 'behavior php-router registers well-known');

$nodeSrc = (string) file_get_contents($repoRoot . '/runtime-node/src/support/platformFingerprint.ts');
assert_true(str_contains($nodeSrc, "headerName: 'X-Jasefly'"), 'Node header name matches PHP');
assert_true(str_contains($nodeSrc, "headerValue: '1'"), 'Node header value matches PHP');
assert_true(str_contains($nodeSrc, "wellKnownPath: '/.well-known/jasefly'"), 'Node well-known path matches PHP');
assert_true(str_contains($nodeSrc, "platform: 'Jasefly'"), 'Node platform name matches PHP');
assert_true(!preg_match("/headerName:\\s*['\"]X-Powered-By['\"]/", $nodeSrc), 'Node fingerprint does not emit X-Powered-By');

$nodeApp = (string) file_get_contents($repoRoot . '/runtime-node/src/app.ts');
assert_true(str_contains($nodeApp, 'registerPlatformFingerprint'), 'Node app registers well-known');
assert_true(str_contains($nodeApp, 'platformFingerprintMiddleware'), 'Node app sets X-Jasefly on responses');

$htmlIndex = (string) file_get_contents($repoRoot . '/frontend/index.html');
assert_true(
    str_contains($htmlIndex, '<meta name="generator" content="Jasefly"'),
    'SPA shell has generator meta'
);
assert_true(str_contains($htmlIndex, 'rel="preconnect" href="https://fonts.googleapis.com"'), 'SPA preconnects fonts.googleapis.com');
assert_true(str_contains($htmlIndex, 'href="https://fonts.gstatic.com" crossorigin'), 'SPA preconnects fonts.gstatic.com with crossorigin');
assert_true(str_contains($htmlIndex, 'display=swap'), 'Google Fonts CSS uses display=swap');

$apiHtaccess = (string) file_get_contents($repoRoot . '/backend/public/.htaccess');
assert_true((bool) preg_match('/^\s*Header unset X-Powered-By\s*$/m', $apiHtaccess), 'API Apache unsets CGI-table X-Powered-By');
assert_true(str_contains($apiHtaccess, 'Header always unset X-Powered-By'), 'API Apache always-unsets X-Powered-By');
assert_true(str_contains($apiHtaccess, 'Header always set X-Jasefly "1"'), 'API Apache sets X-Jasefly');

$layoutSrc = (string) file_get_contents($repoRoot . '/frontend/src/components/layout/SiteLayout.tsx');
assert_true(str_contains($layoutSrc, 'PLATFORM_GENERATOR'), 'SiteLayout uses shared generator constant');

$preSrc = (string) file_get_contents($repoRoot . '/backend/src/Services/PrerenderService.php');
assert_true(str_contains($preSrc, 'PlatformFingerprint::generatorMetaTag'), 'prerender enrich injects generator');
assert_true(str_contains($preSrc, 'name="generator" content="Jasefly"'), 'prerender bot HTML has generator');

$htaccess = (string) file_get_contents($repoRoot . '/frontend/public/.htaccess');
assert_true((bool) preg_match('/^\s*Header unset X-Powered-By\s*$/m', $htaccess), 'Apache unsets CGI-table X-Powered-By');
assert_true(str_contains($htaccess, 'Header always unset X-Powered-By'), 'Apache always-unsets X-Powered-By');
assert_true(str_contains($htaccess, 'Header always set X-Jasefly "1"'), 'Apache sets X-Jasefly');
assert_true(str_contains($htaccess, 'well-known/jasefly'), 'Apache rewrites well-known to index.php');
assert_true(str_contains($htaccess, 'REQUEST_URI} !^/\\.well-known/'), 'Apache excludes well-known from bot prerender');

$buildSrc = (string) file_get_contents($repoRoot . '/scripts/build-hosting.js');
assert_true(str_contains($buildSrc, 'Header always unset X-Powered-By'), 'hosting package still unsets X-Powered-By');
assert_true(str_contains($buildSrc, "'  Header unset X-Powered-By'"), 'hosting package unsets CGI-table X-Powered-By');
assert_true(str_contains($buildSrc, "expose_php = Off"), 'hosting package ships .user.ini expose_php Off');
assert_true(str_contains($buildSrc, 'function exposePhpOffUserIni'), 'hosting package writes .user.ini helper');
assert_true(str_contains($buildSrc, 'Header always set X-Jasefly "1"'), 'hosting package sets X-Jasefly');
assert_true(str_contains($buildSrc, 'well-known/jasefly'), 'hosting package rewrites well-known');
assert_true(str_contains($buildSrc, 'PlatformFingerprint::sendWellKnown'), 'hosting index.php serves well-known JSON');

$staticWellKnown = trim((string) file_get_contents($repoRoot . '/frontend/public/.well-known/jasefly'));
assert_true($staticWellKnown === '{"platform":"Jasefly"}', 'static well-known file matches contract JSON');

foreach ([$hdrSrc, $nodeSrc, $htmlIndex, $preSrc, $staticWellKnown] as $blob) {
    assert_true(!preg_match('/wordpress|drupal|joomla/i', $blob), 'fingerprint does not imitate other CMS');
}
