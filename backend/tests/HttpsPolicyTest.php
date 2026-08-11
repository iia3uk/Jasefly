<?php
declare(strict_types=1);

/**
 * HttpsPolicy + hosting .htaccess TLS gate.
 * Included from run.php (uses global assert_true).
 */

use App\Support\HttpsPolicy;

$tmp = sys_get_temp_dir() . '/jasefly_https_policy_' . bin2hex(random_bytes(4));
assert_true(@mkdir($tmp, 0755, true) || is_dir($tmp), 'HttpsPolicy test storage dir');

try {
    // Default mode auto, no marker
    assert_true(HttpsPolicy::mode($tmp) === HttpsPolicy::MODE_AUTO, 'default mode is auto');
    assert_true(HttpsPolicy::hasMarker($tmp) === false, 'no marker initially');

    // off: never write marker even on HTTPS
    $_SERVER['HTTPS'] = 'on';
    HttpsPolicy::setMode(HttpsPolicy::MODE_OFF, $tmp);
    HttpsPolicy::learnFromRequest($tmp);
    assert_true(HttpsPolicy::hasMarker($tmp) === false, 'off mode does not write marker on HTTPS');

    // auto + HTTPS → marker
    HttpsPolicy::setMode(HttpsPolicy::MODE_AUTO, $tmp);
    HttpsPolicy::learnFromRequest($tmp);
    assert_true(HttpsPolicy::hasMarker($tmp) === true, 'auto mode writes marker on HTTPS');

    // force ensures marker
    HttpsPolicy::clearMarker($tmp);
    HttpsPolicy::setMode(HttpsPolicy::MODE_FORCE, $tmp);
    assert_true(HttpsPolicy::hasMarker($tmp) === true, 'force mode writes marker');

    // setMode off clears marker
    HttpsPolicy::setMode(HttpsPolicy::MODE_OFF, $tmp);
    assert_true(HttpsPolicy::hasMarker($tmp) === false, 'off mode clears marker');

    // HTTP request does not create marker in auto
    unset($_SERVER['HTTPS'], $_SERVER['HTTP_X_FORWARDED_PROTO'], $_SERVER['HTTP_FRONT_END_HTTPS']);
    $_SERVER['SERVER_PORT'] = '80';
    HttpsPolicy::setMode(HttpsPolicy::MODE_AUTO, $tmp);
    HttpsPolicy::learnFromRequest($tmp);
    assert_true(HttpsPolicy::hasMarker($tmp) === false, 'auto + HTTP does not write marker');

    // X-Forwarded-Proto counts as HTTPS
    $_SERVER['HTTP_X_FORWARDED_PROTO'] = 'https';
    HttpsPolicy::learnFromRequest($tmp);
    assert_true(HttpsPolicy::hasMarker($tmp) === true, 'X-Forwarded-Proto https learns marker');

    // Probe fail in auto clears marker (unsafe/loopback URL path via empty origin)
    HttpsPolicy::writeMarker($tmp);
    $probe = HttpsPolicy::probe(null, ['storage' => $tmp, 'app_url' => 'http://127.0.0.1'], $tmp);
    assert_true(($probe['ok'] ?? true) === false, 'probe to loopback fails closed');
    assert_true(HttpsPolicy::hasMarker($tmp) === false, 'auto probe fail clears marker');

    // force keeps marker on probe fail
    HttpsPolicy::setMode(HttpsPolicy::MODE_FORCE, $tmp);
    assert_true(HttpsPolicy::hasMarker($tmp) === true, 'force restored marker');
    $probe2 = HttpsPolicy::probe(null, ['storage' => $tmp, 'app_url' => 'http://127.0.0.1'], $tmp);
    assert_true(($probe2['ok'] ?? true) === false, 'force probe still fails');
    assert_true(HttpsPolicy::hasMarker($tmp) === true, 'force keeps marker after probe fail');
} finally {
    foreach ([HttpsPolicy::MARKER_NAME, HttpsPolicy::MODE_NAME, HttpsPolicy::LAST_PROBE_NAME] as $f) {
        $p = $tmp . '/' . $f;
        if (is_file($p)) {
            @unlink($p);
        }
    }
    @rmdir($tmp);
    unset($_SERVER['HTTPS'], $_SERVER['HTTP_X_FORWARDED_PROTO'], $_SERVER['HTTP_FRONT_END_HTTPS'], $_SERVER['SERVER_PORT']);
}

// Hosting .htaccess must gate Force HTTPS on .https_ok (not unconditional)
$buildSrc = (string) file_get_contents(dirname(__DIR__, 2) . '/scripts/build-hosting.js');
assert_true(str_contains($buildSrc, 'api/storage/.https_ok'), 'build-hosting rootHtaccess checks .https_ok');
assert_true(str_contains($buildSrc, 'env=JASEFLY_HTTPS_OK'), 'HSTS gated on JASEFLY_HTTPS_OK');
// Unconditional force pattern must not appear without preceding .https_ok cond in the generator
$forceBlock = <<<'JS'
    '# Force HTTPS only after platform confirmed TLS (.https_ok marker).',
    'RewriteCond %{DOCUMENT_ROOT}/api/storage/.https_ok -f',
JS;
assert_true(str_contains($buildSrc, "Force HTTPS only after platform confirmed TLS"), 'Force HTTPS is conditional');
assert_true(str_contains($buildSrc, "RewriteCond %{DOCUMENT_ROOT}/api/storage/.https_ok -f"), 'Force HTTPS requires marker file');
assert_true(
    str_contains($buildSrc, "RewriteRule ^ https://%{HTTP_HOST}%{REQUEST_URI} [R=302,L]"),
    'Force HTTPS uses 302 (not 301) to avoid browser cache poison'
);

$pubHt = (string) file_get_contents(dirname(__DIR__, 2) . '/frontend/public/.htaccess');
assert_true(str_contains($pubHt, 'api/storage/.https_ok'), 'frontend public .htaccess checks .https_ok');
assert_true(
    !preg_match('/^RewriteRule \^ https:\/\/%\{HTTP_HOST\}/m', $pubHt)
    || str_contains($pubHt, '.https_ok'),
    'public .htaccess Force HTTPS is gated'
);

assert_true(class_exists(HttpsPolicy::class), 'HttpsPolicy class exists');
