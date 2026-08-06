<?php
declare(strict_types=1);

/**
 * P0 security regressions: content/webhook/revision ACL + PublicOrigin host hardening.
 * Included from run.php (uses global assert_true).
 */

use App\Modules\Payments\Providers\ProviderContext;
use App\Services\PermissionService;
use App\Support\PublicOrigin;

$adminSrc = (string) file_get_contents(dirname(__DIR__) . '/src/Controllers/AdminController.php');
assert_true(str_contains($adminSrc, 'requireContentMutation'), 'AdminController gates content mutations');
assert_true(str_contains($adminSrc, "integrations.manage"), 'AdminController gates webhooks resource');

$mwSrc = (string) file_get_contents(dirname(__DIR__) . '/src/Middleware/PermissionMiddleware.php');
assert_true(str_contains($mwSrc, 'requireContentMutation'), 'PermissionMiddleware gates content mutations');
assert_true(str_contains($mwSrc, 'integrations.manage'), 'PermissionMiddleware gates webhooks mutations');

$whSrc = (string) file_get_contents(dirname(__DIR__) . '/src/Modules/Webhooks/WebhooksModule.php');
assert_true(substr_count($whSrc, "integrations.manage") >= 3, 'WebhooksModule requires integrations.manage on mutate');

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

// ProviderContext absolute URL uses app_url, not Host
require_once dirname(__DIR__) . '/src/Modules/Payments/Providers/ProviderInterface.php';
\App\Core\Container::getInstance()->set('app', ['app_url' => 'https://pay.example.com']);
$ctxPay = new ProviderContext($ctx['db'], [], '/api/v1');
$_SERVER['HTTP_HOST'] = 'evil.host.invalid';
$url = $ctxPay->absolute('/api/v1/payments/webhook?provider=test');
assert_true(str_starts_with($url, 'https://pay.example.com/'), 'payment absolute uses app_url');
assert_true(!str_contains($url, 'evil.host.invalid'), 'payment absolute ignores malicious Host');

($ctx['cleanup'])();
