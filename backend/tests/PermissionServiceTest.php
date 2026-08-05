<?php
declare(strict_types=1);

/**
 * PermissionService role × permission matrix (SQLite).
 */

use App\Services\PermissionService;

if (!extension_loaded('pdo_sqlite')) {
    echo "  SKIP PermissionService (pdo_sqlite missing)\n";
    return;
}

require_once __DIR__ . '/helpers.php';
$ctx = jasefly_test_sqlite_boot();

try {
    jasefly_test_apply_core_schema($ctx);
} catch (Throwable $e) {
    assert_true(false, 'schema for permissions: ' . $e->getMessage());
    ($ctx['cleanup'])();
    return;
}

PermissionService::clearCache();
$perms = new PermissionService($ctx['db']);

$super = ['sub' => 1, 'role' => 'super_admin'];
$admin = ['sub' => 2, 'role' => 'admin'];
$editor = ['sub' => 3, 'role' => 'editor'];

assert_true($perms->can($super, 'system.manage') === true, 'super_admin can system.manage');
assert_true($perms->can($super, 'content.view') === true, 'super_admin can content.view');
assert_true($perms->can($admin, 'system.manage') === false, 'admin cannot system.manage (hardened)');
assert_true($perms->can($admin, 'settings.manage') === true, 'admin can settings.manage');
assert_true($perms->can($admin, 'users.manage') === true, 'admin can users.manage');
assert_true($perms->can($editor, 'content.update') === true, 'editor can content.update');
assert_true($perms->can($editor, 'system.manage') === false, 'editor cannot system.manage');
assert_true($perms->can($editor, 'settings.manage') === false, 'editor cannot settings.manage');

// Stale JWT super_admin after DB demotion must not keep unrestricted access.
$ctx['db']->run(
    'INSERT INTO users (id, email, password_hash, name, role) VALUES (10, ?, ?, ?, ?)',
    ['super@test.local', 'x', 'Super', 'super_admin']
);
$jwtSuper = ['sub' => 10, 'role' => 'super_admin'];
assert_true($perms->can($jwtSuper, 'system.manage') === true, 'live super_admin can system.manage');
$ctx['db']->run('UPDATE users SET role=? WHERE id=?', ['editor', 10]);
PermissionService::clearCache();
assert_true($perms->can($jwtSuper, 'system.manage') === false, 'demoted user JWT super_admin claim denied');

assert_true($perms->isSystemRoute('/api/v1/admin/plugins') === true, 'plugins is system route');
assert_true($perms->isSystemRoute('/api/v1/admin/backup') === true, 'backup is system route');
assert_true($perms->isSettingsRoute('/api/v1/admin/seo') === true, 'seo is settings route');
assert_true($perms->isSettingsRoute('/api/v1/admin/plugins') === false, 'plugins is not settings route');

($ctx['cleanup'])();
