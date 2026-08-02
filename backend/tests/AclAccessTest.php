<?php
declare(strict_types=1);

/**
 * Admin ACL: deny>allow, capability provider, catalog register — included from run.php.
 */

use App\Platform\Access\AccessProviderRegistry;
use App\Platform\Access\AccessService;
use App\Platform\Access\Acl\AccessContext;
use App\Platform\Access\Acl\AclCapabilityCatalog;
use App\Platform\Access\Acl\AclEffectiveCache;
use App\Platform\Access\AdminNavRegistry;
use App\Platform\Access\Providers\CapabilityAccessProvider;

// —— Catalog + aliases (no DB) ——
$cat = new AclCapabilityCatalog(null);
assert_true($cat->has('content.view'), 'catalog has content.view');
assert_true($cat->resolveAlias('content.update') === 'content.edit_any', 'alias content.update → edit_any');
$eq = $cat->expandEquivalents('content.update');
assert_true(in_array('content.edit_any', $eq, true), 'equivalents include edit_any');

$cat->register([
    'slug' => 'zip.demo.view',
    'label' => 'ZIP demo',
    'group' => 'modules',
    'risk' => 'low',
    'default_roles' => ['admin'],
]);
assert_true($cat->has('zip.demo.view'), 'runtime registerCapability');

// —— Nav registry filter ——
$nav = new AdminNavRegistry();
$nav->register([
    'group' => 'Система',
    'path' => '/admin/users',
    'label' => 'Users',
    'capability' => 'users.view',
]);
$nav->register([
    'group' => 'Система',
    'path' => '/admin/roles',
    'label' => 'Roles',
    'capability' => 'roles.manage',
]);
$groups = $nav->filteredGroups(static fn(string $c): bool => $c === 'users.view');
assert_true(count($groups) === 1, 'empty capability items drop group peers');
assert_true(count($groups[0]['items']) === 1, 'only allowed nav item kept');
$empty = $nav->filteredGroups(static fn(string $c): bool => false);
assert_true($empty === [], 'no access hides all groups');

// —— Capability provider with fake resolver via AccessService (needs DB for full) ——
if (!extension_loaded('pdo_sqlite')) {
    echo "  SKIP AclEffectiveResolver DB tests (pdo_sqlite missing)\n";
} else {
    require_once __DIR__ . '/helpers.php';
    $boot = jasefly_test_sqlite_boot();
    $db = $boot['db'];
    $cleanup = $boot['cleanup'];
    try {
        // Minimal schema for ACL
        $db->pdo()->exec('CREATE TABLE roles (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            slug TEXT UNIQUE,
            name TEXT,
            description TEXT,
            is_system INTEGER DEFAULT 0,
            is_super INTEGER DEFAULT 0,
            role_rank INTEGER DEFAULT 100
        )');
        $db->pdo()->exec('CREATE TABLE permissions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            slug TEXT UNIQUE,
            name TEXT,
            group_name TEXT,
            description TEXT,
            risk_level TEXT DEFAULT \'low\',
            scope_default TEXT DEFAULT \'site\',
            is_active INTEGER DEFAULT 1
        )');
        $db->pdo()->exec('CREATE TABLE role_permissions (
            role_id INTEGER, permission_id INTEGER, PRIMARY KEY (role_id, permission_id)
        )');
        $db->pdo()->exec('CREATE TABLE user_roles (
            user_id INTEGER, role_id INTEGER, is_primary INTEGER DEFAULT 0, PRIMARY KEY (user_id, role_id)
        )');
        $db->pdo()->exec('CREATE TABLE user_capability_overrides (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER, capability_slug TEXT, effect TEXT,
            UNIQUE(user_id, capability_slug)
        )');
        $db->pdo()->exec('CREATE TABLE users (
            id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT, password_hash TEXT, name TEXT, role TEXT
        )');
        $db->pdo()->exec('CREATE TABLE permission_aliases (
            alias_slug TEXT PRIMARY KEY, target_slug TEXT
        )');

        $db->run("INSERT INTO roles (id, slug, name, is_super, role_rank) VALUES (1, 'editor', 'Editor', 0, 20)");
        $db->run("INSERT INTO roles (id, slug, name, is_super, role_rank) VALUES (2, 'author', 'Author', 0, 30)");
        $db->run("INSERT INTO roles (id, slug, name, is_super, role_rank) VALUES (3, 'super_admin', 'SA', 1, 0)");
        $db->run("INSERT INTO permissions (slug, name, group_name) VALUES ('content.view', 'View', 'content')");
        $db->run("INSERT INTO permissions (slug, name, group_name) VALUES ('content.edit_own', 'Edit own', 'content')");
        $db->run("INSERT INTO permissions (slug, name, group_name) VALUES ('content.edit_any', 'Edit any', 'content')");
        $db->run("INSERT INTO permissions (slug, name, group_name) VALUES ('content.update', 'Update', 'content')");
        $db->run("INSERT INTO role_permissions (role_id, permission_id) SELECT 1, id FROM permissions WHERE slug IN ('content.view','content.edit_any','content.update')");
        $db->run("INSERT INTO role_permissions (role_id, permission_id) SELECT 2, id FROM permissions WHERE slug IN ('content.view','content.edit_own')");
        $db->run("INSERT INTO users (id, email, password_hash, name, role) VALUES (10, 'a@b.c', 'x', 'A', 'editor')");
        $db->run("INSERT INTO users (id, email, password_hash, name, role) VALUES (11, 'b@b.c', 'x', 'B', 'author')");
        $db->run("INSERT INTO user_roles (user_id, role_id, is_primary) VALUES (10, 1, 1)");
        $db->run("INSERT INTO user_roles (user_id, role_id, is_primary) VALUES (11, 2, 1)");
        // Multi-role: author + editor on user 11
        $db->run("INSERT INTO user_roles (user_id, role_id, is_primary) VALUES (11, 1, 0)");

        AclEffectiveCache::forget();
        $reg = new AccessProviderRegistry();
        $svc = new AccessService($reg, $db);
        $svc->registerBuiltins();

        assert_true($svc->canCapability(new AccessContext(10, 'content.view'))->allowed, 'editor has content.view');
        assert_true($svc->canCapability(new AccessContext(10, 'content.update'))->allowed, 'editor has content.update via edit_any');
        assert_true($svc->canCapability(new AccessContext(11, 'content.edit_any'))->allowed, 'multi-role union grants edit_any');

        // deny override wins
        $db->run("INSERT INTO user_capability_overrides (user_id, capability_slug, effect) VALUES (10, 'content.view', 'deny')");
        AclEffectiveCache::forget(10);
        assert_true(!$svc->canCapability(new AccessContext(10, 'content.view'))->allowed, 'deny override wins');

        // allow override
        $db->run("INSERT INTO user_capability_overrides (user_id, capability_slug, effect) VALUES (10, 'content.edit_own', 'allow')");
        AclEffectiveCache::forget(10);
        assert_true($svc->canCapability(new AccessContext(10, 'content.edit_own'))->allowed, 'allow override grants');

        // unknown capability fail-closed
        assert_true(!$svc->canCapability(new AccessContext(10, 'totally.unknown.cap.xyz'))->allowed, 'unknown capability deny');

        // own scope: author without any cannot edit others
        AclEffectiveCache::forget();
        $db->run('DELETE FROM user_roles WHERE user_id = 11 AND role_id = 1');
        AclEffectiveCache::forget(11);
        $ownDeny = $svc->canCapability(new AccessContext(11, 'content.edit_own', 'own', 99));
        assert_true(!$ownDeny->allowed, 'own scope denies other owner');
        $ownOk = $svc->canCapability(new AccessContext(11, 'content.edit_own', 'own', 11));
        assert_true($ownOk->allowed, 'own scope allows self');

        // DSL capability leaf
        $dsl = $svc->can(10, [
            'version' => 1,
            'op' => 'all',
            'rules' => [[
                'provider' => 'capability',
                'assert' => 'has',
                'params' => ['capability' => 'content.edit_own'],
            ]],
        ]);
        assert_true($dsl->allowed, 'DSL capability provider has');

        $batch = $svc->batchCan(11, ['content.view', 'roles.manage']);
        assert_true($batch['content.view'] === true, 'batchCan content.view');
        assert_true($batch['roles.manage'] === false, 'batchCan roles.manage false');

        $explain = $svc->explain(11, 'content.view');
        assert_true(isset($explain['sources']) && is_array($explain['sources']), 'explain has sources');
    } finally {
        $cleanup();
    }
}

echo "  AclAccessTest done\n";
