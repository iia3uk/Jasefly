<?php
declare(strict_types=1);

namespace App\Controllers;

use App\Database;
use App\Platform\Access\AccessHost;
use App\Platform\Access\Acl\AclAuditLogger;
use App\Platform\Access\Acl\AclEffectiveCache;
use App\Request;
use App\Response;
use App\Services\PermissionService;

/** Admin ACL: bootstrap, effective rights, overrides, role matrix helpers. */
final class AccessAdminController
{
    private PermissionService $permissions;
    private AclAuditLogger $audit;

    public function __construct(private Database $db, private array $app)
    {
        $this->permissions = new PermissionService($db);
        $this->audit = new AclAuditLogger($db);
    }

    public function bootstrap(Request $r): never
    {
        $user = $r->user ?? [];
        $userId = (int) ($user['sub'] ?? 0);
        $access = AccessHost::boot($this->db);
        $bundle = $access->effectiveBundle($userId > 0 ? $userId : null);
        if (((string) ($user['role'] ?? '')) === 'super_admin' || ($user['auth'] ?? '') === 'mcp_token') {
            $bundle['is_super'] = true;
        }
        if (!$bundle['is_super'] && !in_array('dashboard.view', $bundle['caps'], true) && $bundle['caps'] === []) {
            Response::error('Forbidden', 403, [], ['code' => 'forbidden', 'capability' => 'dashboard.view']);
        }
        $can = static fn(string $cap): bool => in_array($cap, $bundle['caps'], true) || $bundle['is_super'];
        $nav = $access->navRegistry()->filteredGroups($can);
        Response::json([
            'data' => [
                'capabilities' => $bundle['caps'],
                'roles' => $bundle['roles'],
                'is_super' => $bundle['is_super'],
                'version' => $bundle['version'],
                'nav' => $nav,
                'catalog' => $access->capabilityCatalog(),
            ],
        ]);
    }

    public function effective(Request $r, string $id): never
    {
        $this->permissions->require($r->user ?? [], 'access.manage');
        $userId = (int) $id;
        $access = AccessHost::boot($this->db);
        $bundle = $access->effectiveBundle($userId);
        $cap = trim((string) ($r->query['capability'] ?? $r->input('capability') ?? ''));
        $explain = $cap !== '' ? $access->explain($userId, $cap) : null;
        Response::json([
            'data' => [
                'user_id' => $userId,
                'bundle' => $bundle,
                'explain' => $explain,
            ],
        ]);
    }

    public function batchCan(Request $r): never
    {
        $user = $r->user ?? [];
        $userId = (int) ($user['sub'] ?? 0);
        $caps = $r->input('capabilities');
        if (!is_array($caps)) {
            Response::error('capabilities array required', 422);
        }
        $access = AccessHost::boot($this->db);
        Response::json(['data' => $access->batchCan($userId > 0 ? $userId : null, $caps)]);
    }

    public function getOverrides(Request $r, string $id): never
    {
        $this->permissions->require($r->user ?? [], 'access.manage');
        $rows = $this->db->all(
            'SELECT capability_slug, effect, created_at FROM user_capability_overrides WHERE user_id = ? ORDER BY capability_slug',
            [(int) $id]
        );
        Response::json(['data' => $rows]);
    }

    public function putOverrides(Request $r, string $id): never
    {
        $actor = $r->user ?? [];
        $this->permissions->require($actor, 'access.manage');
        $targetId = (int) $id;
        $actorId = (int) ($actor['sub'] ?? 0);
        $items = $r->input('overrides');
        if (!is_array($items)) {
            Response::error('overrides array required', 422);
        }
        $access = AccessHost::boot($this->db);
        $actorBundle = $access->effectiveBundle($actorId);
        $before = $this->db->all('SELECT capability_slug, effect FROM user_capability_overrides WHERE user_id = ?', [$targetId]);

        $this->db->run('DELETE FROM user_capability_overrides WHERE user_id = ?', [$targetId]);
        foreach ($items as $item) {
            if (!is_array($item)) {
                continue;
            }
            $slug = trim((string) ($item['capability_slug'] ?? $item['capability'] ?? ''));
            $effect = (string) ($item['effect'] ?? '');
            if ($slug === '' || !in_array($effect, ['allow', 'deny'], true)) {
                continue;
            }
            if (!$actorBundle['is_super'] && !in_array($slug, $actorBundle['caps'], true) && $effect === 'allow') {
                Response::error('Cannot grant capability you do not have: ' . $slug, 403, [], [
                    'code' => 'privilege_escalation',
                    'capability' => $slug,
                ]);
            }
            $this->db->run(
                'INSERT INTO user_capability_overrides (user_id, capability_slug, effect) VALUES (?, ?, ?)',
                [$targetId, $slug, $effect]
            );
        }

        // Prevent self-lockout of access.manage
        if ($targetId === $actorId) {
            $afterBundle = $access->effectiveBundle($targetId);
            AclEffectiveCache::forget($targetId);
            $afterBundle = $access->effectiveBundle($targetId);
            if (!$afterBundle['is_super'] && !in_array('access.manage', $afterBundle['caps'], true)
                && !in_array('roles.manage', $afterBundle['caps'], true)
                && !in_array('users.manage', $afterBundle['caps'], true)) {
                Response::error('Cannot remove your last access-management capability', 422);
            }
        }

        AclEffectiveCache::forget($targetId);
        $after = $this->db->all('SELECT capability_slug, effect FROM user_capability_overrides WHERE user_id = ?', [$targetId]);
        $this->audit->log($actorId, 'overrides.update', 'user', $targetId, ['overrides' => $before], ['overrides' => $after], $r->ip());
        Response::json(['data' => $after]);
    }

    public function putUserRoles(Request $r, string $id): never
    {
        $actor = $r->user ?? [];
        $this->permissions->require($actor, 'users.edit');
        if (!$this->permissions->can($actor, 'roles.manage') && !$this->permissions->can($actor, 'access.manage')
            && !$this->permissions->can($actor, 'users.manage')) {
            $this->permissions->require($actor, 'roles.manage');
        }
        $targetId = (int) $id;
        $actorId = (int) ($actor['sub'] ?? 0);
        $roleSlugs = $r->input('roles');
        if (!is_array($roleSlugs) || $roleSlugs === []) {
            Response::error('roles array required', 422);
        }
        $roleSlugs = array_values(array_unique(array_map(static fn($s) => strtolower(trim((string) $s)), $roleSlugs)));
        $primary = strtolower(trim((string) ($r->input('primary') ?? $roleSlugs[0])));

        $access = AccessHost::boot($this->db);
        $actorBundle = $access->effectiveBundle($actorId);

        // Last super-admin protection
        $targetWasSuper = $this->userHasSuper($targetId);
        $willBeSuper = in_array('super_admin', $roleSlugs, true);
        if ($targetWasSuper && !$willBeSuper && $this->countSuperUsers() <= 1) {
            Response::error('Cannot remove the last super-admin', 422);
        }
        if ($willBeSuper && !$actorBundle['is_super']) {
            Response::error('Cannot assign super-admin role', 403, [], ['code' => 'privilege_escalation']);
        }

        $before = $this->db->all(
            'SELECT r.slug FROM user_roles ur INNER JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = ?',
            [$targetId]
        );

        $this->db->run('DELETE FROM user_roles WHERE user_id = ?', [$targetId]);
        foreach ($roleSlugs as $slug) {
            $role = $this->db->one('SELECT id FROM roles WHERE slug = ?', [$slug]);
            if (!$role) {
                continue;
            }
            $this->db->run(
                'INSERT INTO user_roles (user_id, role_id, is_primary) VALUES (?, ?, ?)',
                [$targetId, (int) $role['id'], $slug === $primary ? 1 : 0]
            );
        }
        if ($primary !== '') {
            $this->db->run('UPDATE users SET role = ? WHERE id = ?', [$primary, $targetId]);
        }

        AclEffectiveCache::forget($targetId);
        if ($targetId === $actorId) {
            $afterBundle = $access->effectiveBundle($targetId);
            if (!$afterBundle['is_super'] && !in_array('access.manage', $afterBundle['caps'], true)
                && !in_array('users.manage', $afterBundle['caps'], true)
                && !in_array('roles.manage', $afterBundle['caps'], true)) {
                Response::error('Cannot remove your last access-management role', 422);
            }
        }

        $after = $this->db->all(
            'SELECT r.slug FROM user_roles ur INNER JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = ?',
            [$targetId]
        );
        $this->audit->log($actorId, 'user.roles.update', 'user', $targetId, ['roles' => $before], ['roles' => $after], $r->ip());
        Response::json(['data' => ['roles' => array_column($after, 'slug'), 'primary' => $primary]]);
    }

    private function userHasSuper(int $userId): bool
    {
        try {
            $row = $this->db->one(
                'SELECT 1 AS ok FROM user_roles ur INNER JOIN roles r ON r.id = ur.role_id
                 WHERE ur.user_id = ? AND (r.is_super = 1 OR r.slug = ?) LIMIT 1',
                [$userId, 'super_admin']
            );
            return $row !== null;
        } catch (\Throwable) {
            $row = $this->db->one('SELECT role FROM users WHERE id = ?', [$userId]);
            return ($row['role'] ?? '') === 'super_admin';
        }
    }

    private function countSuperUsers(): int
    {
        try {
            $row = $this->db->one(
                'SELECT COUNT(DISTINCT ur.user_id) AS c FROM user_roles ur
                 INNER JOIN roles r ON r.id = ur.role_id
                 WHERE r.is_super = 1 OR r.slug = ?',
                ['super_admin']
            );
            return (int) ($row['c'] ?? 0);
        } catch (\Throwable) {
            $row = $this->db->one("SELECT COUNT(*) AS c FROM users WHERE role = 'super_admin'");
            return (int) ($row['c'] ?? 0);
        }
    }
}
