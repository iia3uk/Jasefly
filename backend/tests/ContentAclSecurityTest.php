<?php
declare(strict_types=1);

/**
 * P0 security regressions: content/webhook/revision ACL + PublicOrigin host hardening.
 * Included from run.php (uses global assert_true).
 */

use App\Services\PermissionService;
use App\Support\PublicOrigin;

$adminSrc = (string) file_get_contents(dirname(__DIR__) . '/src/Controllers/AdminController.php');
assert_true(str_contains($adminSrc, 'requireContentMutation'), 'AdminController gates content mutations');
assert_true(!str_contains($adminSrc, "'webhooks' => 'webhooks'"), 'AdminController no longer hardcodes webhooks resource map');

$mwSrc = (string) file_get_contents(dirname(__DIR__) . '/src/Middleware/PermissionMiddleware.php');
assert_true(str_contains($mwSrc, 'requireContentMutation'), 'PermissionMiddleware gates content mutations');
assert_true(!str_contains($mwSrc, '/admin/webhooks'), 'PermissionMiddleware has no webhooks path hardcode');
assert_true(!str_contains($mwSrc, '/admin/forms'), 'PermissionMiddleware has no forms path hardcode');
assert_true(!str_contains($mwSrc, '/admin/comments'), 'PermissionMiddleware has no comments path hardcode');
assert_true(str_contains($mwSrc, 'contentResources'), 'DELETE/mutate ACL scoped to content resources only');

$whCandidates = [
    dirname(__DIR__, 2) . '/modules-src/webhooks/backend/WebhooksModule.php',
    dirname(__DIR__) . '/tests/fixtures/modules/webhooks/backend/WebhooksModule.php',
];
$whSrc = '';
foreach ($whCandidates as $path) {
    if (is_file($path)) {
        $whSrc = (string) file_get_contents($path);
        break;
    }
}
assert_true($whSrc !== '', 'webhooks package module source present');
assert_true(substr_count($whSrc, "integrations.manage") >= 3, 'Webhooks package owns integrations.manage on mutate');

$sysSrc = (string) file_get_contents(dirname(__DIR__) . '/src/Modules/System/SystemModule.php');
assert_true(str_contains($sysSrc, "requireContentMutation"), 'SystemModule revision restore requires content capability');

$accessFe = (string) file_get_contents(dirname(__DIR__, 2) . '/frontend/src/builder/widgets/access.tsx');
assert_true(str_contains($accessFe, 'sanitizeHtml(template)'), 'deny_template_html uses sanitizeHtml');

// —— PublicOrigin: configured app_url wins over malicious Host ——
$_SERVER['HTTP_HOST'] = 'evil.attacker.example';
$_SERVER['HTTPS'] = 'on';
$origin = PublicOrigin::resolve(null, ['app_url' => 'https://cms.example.com']);
assert_true($origin === 'https://cms.example.com', 'PublicOrigin prefers configured app_url');
assert_true(!str_contains($origin, 'evil.attacker.example'), 'malicious Host not used when app_url set');

$badHost = PublicOrigin::isValidHostHeader("evil.com\r\nX-Injected: 1");
assert_true($badHost === false, 'Host header CRLF rejected');
assert_true(PublicOrigin::isValidHostHeader('evil.com;rm') === false, 'Host header metachar rejected');
assert_true(PublicOrigin::isValidHostHeader('good.example.com') === true, 'valid Host accepted');

if (!extension_loaded('pdo_sqlite')) {
    echo "  SKIP ContentAcl capability matrix (pdo_sqlite missing)\n";
    return;
}

require_once __DIR__ . '/helpers.php';
$ctx = jasefly_test_sqlite_boot();
try {
    jasefly_test_apply_core_schema($ctx);
} catch (Throwable $e) {
    assert_true(false, 'schema for content ACL: ' . $e->getMessage());
    ($ctx['cleanup'])();
    return;
}

PermissionService::clearCache();
$perms = new PermissionService($ctx['db']);

$memberId = 50;
$editorId = 51;
$adminId = 52;
$ctx['db']->run(
    'INSERT INTO users (id, email, password_hash, name, role) VALUES (?, ?, ?, ?, ?)',
    [$memberId, 'member@test.local', 'x', 'Member', 'member']
);
$ctx['db']->run(
    'INSERT INTO users (id, email, password_hash, name, role) VALUES (?, ?, ?, ?, ?)',
    [$editorId, 'editor@test.local', 'x', 'Editor', 'editor']
);
$ctx['db']->run(
    'INSERT INTO users (id, email, password_hash, name, role) VALUES (?, ?, ?, ?, ?)',
    [$adminId, 'admin@test.local', 'x', 'Admin', 'admin']
);

$member = ['sub' => $memberId, 'role' => 'member', 'type' => 'access'];
$editor = ['sub' => $editorId, 'role' => 'editor', 'type' => 'access'];
$admin = ['sub' => $adminId, 'role' => 'admin', 'type' => 'access'];

// Low-privilege JWT / member: mutating content + integrations denied
assert_true($perms->canMutateContent($member, 'create') === false, 'member create content denied');
assert_true($perms->canMutateContent($member, 'update') === false, 'member update content denied');
assert_true($perms->canMutateContent($member, 'update') === false, 'member restore (update cap) denied');
assert_true($perms->can($member, 'integrations.manage') === false, 'member webhooks manage denied');

// Authorized: editor content yes; admin integrations yes
assert_true($perms->canMutateContent($editor, 'create') === true, 'editor create content allowed');
assert_true($perms->canMutateContent($editor, 'update') === true, 'editor update content allowed');
assert_true($perms->can($admin, 'integrations.manage') === true, 'admin webhooks manage allowed');
assert_true($perms->can($editor, 'integrations.manage') === false, 'editor webhooks manage denied without cap');

// Payments package uses its Platform config source rather than raw Host headers.
$payIfaceCandidates = [
    dirname(__DIR__, 2) . '/modules-src/payments/backend/Providers/ProviderInterface.php',
    __DIR__ . '/fixtures/modules/payments/backend/Providers/ProviderInterface.php',
];
$payIface = null;
foreach ($payIfaceCandidates as $c) {
    if (is_file($c)) {
        $payIface = $c;
        break;
    }
}
assert_true($payIface !== null, 'payments ProviderInterface available (local workspace or fixture)');
$paySrc = (string) file_get_contents($payIface);
assert_true(str_contains($paySrc, "config->get('site_url'") && str_contains($paySrc, "config->get('app_url'"), 'payment absolute URL uses Platform config');
assert_true(!str_contains($paySrc, 'PublicOrigin::fallbackFromRequest'), 'payment package does not trust Host fallback');

($ctx['cleanup'])();
