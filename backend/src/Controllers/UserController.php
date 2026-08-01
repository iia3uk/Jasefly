<?php
declare(strict_types=1);

namespace App\Controllers;

use App\Database;
use App\Request;
use App\Response;
use App\Services\ActivityLogService;
use App\Services\PermissionService;
use App\Utils\Password;

/**
 * Multi-user management: users CRUD + role/permission assignment.
 *
 * Policy-based access:
 *   - super_admin: full control over users and roles
 *   - admin: can manage editors, cannot manage admins/super_admins or roles
 *   - editor: no access
 */
final class UserController
{
    private ActivityLogService $activity;
    private PermissionService $permissions;

    public function __construct(private Database $db, private array $app)
    {
        $this->activity = new ActivityLogService($db);
        $this->permissions = new PermissionService($db);
    }

    private function guardUsers(array $user): void
    {
        if ($this->permissions->can($user, 'users.manage') || $this->permissions->can($user, 'users.view')) {
            return;
        }
        $this->permissions->require($user, 'users.view');
    }

    private function guardRoles(array $user): void
    {
        if ($this->permissions->can($user, 'roles.manage') || $this->permissions->can($user, 'access.manage')) {
            return;
        }
        $this->permissions->require($user, 'roles.manage');
    }

    private function actorIsSuper(array $user): bool
    {
        $id = (int) ($user['sub'] ?? 0);
        if ($id <= 0) {
            return ((string) ($user['role'] ?? '')) === 'super_admin';
        }
        try {
            $bundle = \App\Platform\Access\AccessHost::boot($this->db)->effectiveBundle($id);
            return $bundle['is_super'];
        } catch (\Throwable) {
            return ((string) ($user['role'] ?? '')) === 'super_admin';
        }
    }

    public function index(Request $r): never
    {
        $this->guardUsers($r->user ?? []);
        $rows = $this->db->all('SELECT id, email, name, role, avatar_media_id, last_login_at, created_at FROM users ORDER BY id');
        Response::json(['data' => $rows]);
    }

    public function show(Request $r, string $id): never
    {
        $this->guardUsers($r->user ?? []);
        $row = $this->db->one('SELECT id, email, name, role, avatar_media_id, last_login_at, created_at FROM users WHERE id = ?', [$id]);
        if (!$row) {
            Response::error('User not found', 404);
        }
        Response::json(['data' => $row]);
    }

    public function create(Request $r): never
    {
        $this->guardUsers($r->user ?? []);
        $actor = $r->user ?? [];

        $email = strtolower(trim((string) ($r->input('email') ?? '')));
        $name = trim((string) ($r->input('name') ?? ''));
        $password = (string) ($r->input('password') ?? '');
        $role = strtolower((string) ($r->input('role') ?? 'editor'));
        $allowedRoles = ['admin', 'editor', 'author', 'contributor', 'subscriber', 'member'];
        if ($email === '' || $name === '' || strlen($password) < 8) {
            Response::error('Email, name and password (min 8 chars) are required', 422);
        }
        $this->permissions->require($actor, 'users.create');
        if (!$this->actorIsSuper($actor)) {
            if (!in_array($role, ['editor', 'author', 'contributor', 'subscriber', 'member'], true)) {
                Response::error('Forbidden: cannot assign this role', 403);
            }
        } elseif (!in_array($role, array_merge($allowedRoles, ['super_admin']), true)) {
            Response::error('Invalid role', 422);
        }
        if ($role === 'super_admin' && !$this->actorIsSuper($actor)) {
            Response::error('Forbidden: cannot assign super_admin', 403);
        }
        if ($this->db->one('SELECT id FROM users WHERE email = ?', [$email])) {
            Response::error('Email already in use', 422);
        }

        $hash = Password::hash($password);
        $this->db->run(
            'INSERT INTO users (email, password_hash, name, role) VALUES (?, ?, ?, ?)',
            [$email, $hash, $name, $role]
        );
        $id = $this->db->id();
        $this->syncPrimaryRole($id, $role);
        $this->activity->log($r, 'create', 'users', $id, $name);
        Response::json(['data' => ['id' => $id]], 201);
    }

    public function update(Request $r, string $id): never
    {
        $this->guardUsers($r->user ?? []);
        $this->permissions->require($r->user ?? [], 'users.edit');
        $actor = $r->user ?? [];

        $existing = $this->db->one('SELECT * FROM users WHERE id = ?', [$id]);
        if (!$existing) {
            Response::error('User not found', 404);
        }
        if (!$this->actorIsSuper($actor) && in_array($existing['role'], ['admin', 'super_admin'], true)) {
            Response::error('Forbidden: cannot modify this user', 403);
        }

        $name = $r->input('name');
        $role = $r->input('role');
        $password = $r->input('password');

        $sets = [];
        $params = [];
        if (is_string($name) && $name !== '') {
            $sets[] = 'name = ?';
            $params[] = $name;
        }
        $writableRoles = ['admin', 'editor', 'author', 'contributor', 'subscriber', 'member'];
        if (is_string($role) && in_array($role, $writableRoles, true)) {
            if (!$this->actorIsSuper($actor) && !in_array($role, ['editor', 'author', 'contributor', 'subscriber', 'member'], true)) {
                Response::error('Forbidden: cannot assign this role', 403);
            }
            $sets[] = 'role = ?';
            $params[] = $role;
        }
        if (is_string($password) && strlen($password) >= 8) {
            $sets[] = 'password_hash = ?';
            $params[] = Password::hash($password);
        }
        if (!$sets) {
            Response::error('No writable fields', 422);
        }
        $params[] = $id;
        $this->db->run('UPDATE users SET ' . implode(', ', $sets) . ' WHERE id = ?', $params);
        if (is_string($role) && in_array($role, $writableRoles, true)) {
            $this->syncPrimaryRole((int) $id, $role);
        }
        \App\Platform\Access\Acl\AclEffectiveCache::forget((int) $id);
        $this->activity->log($r, 'update', 'users', (int) $id, is_string($name) ? $name : $existing['name']);
        Response::json(['message' => 'User updated']);
    }

    public function delete(Request $r, string $id): never
    {
        $this->guardUsers($r->user ?? []);
        $actor = $r->user ?? [];
        $existing = $this->db->one('SELECT * FROM users WHERE id = ?', [$id]);
        if (!$existing) {
            Response::error('User not found', 404);
        }
        // Cannot delete self; non-super_admin cannot delete admins/super_admins.
        if ((int) $id === (int) ($actor['sub'] ?? 0)) {
            Response::error('Cannot delete yourself', 422);
        }
        $this->permissions->require($actor, 'users.delete');
        if (!$this->actorIsSuper($actor) && in_array($existing['role'], ['admin', 'super_admin'], true)) {
            Response::error('Forbidden: cannot delete this user', 403);
        }
        if (($existing['role'] ?? '') === 'super_admin') {
            $cnt = $this->db->one("SELECT COUNT(*) AS c FROM users WHERE role = 'super_admin'");
            if ((int) ($cnt['c'] ?? 0) <= 1) {
                Response::error('Cannot delete the last super-admin', 422);
            }
        }
        $this->db->run('DELETE FROM users WHERE id = ?', [$id]);
        $this->db->run('DELETE FROM refresh_tokens WHERE user_id = ?', [$id]);
        $this->activity->log($r, 'delete', 'users', (int) $id, $existing['name']);
        Response::json(['message' => 'User deleted']);
    }

    // ── Roles & permissions ──────────────────────────────────────────────

    public function rolesIndex(Request $r): never
    {
        $this->guardUsers($r->user ?? []);
        Response::json(['data' => $this->permissions->roles()]);
    }

    public function permissionsIndex(Request $r): never
    {
        $this->guardUsers($r->user ?? []);
        Response::json(['data' => $this->permissions->permissions()]);
    }

    public function rolePermissions(Request $r, string $roleId): never
    {
        $this->guardRoles($r->user ?? []);
        $rows = $this->db->all(
            'SELECT p.slug, p.name, p.group_name FROM permissions p
             INNER JOIN role_permissions rp ON rp.permission_id = p.id
             WHERE rp.role_id = ?
             ORDER BY p.group_name, p.slug',
            [$roleId]
        );
        Response::json(['data' => $rows]);
    }

    public function updateRolePermissions(Request $r, string $roleId): never
    {
        $this->guardRoles($r->user ?? []);
        $role = $this->db->one('SELECT * FROM roles WHERE id = ?', [$roleId]);
        if (!$role) {
            Response::error('Role not found', 404);
        }

        $permissionSlugs = (array) ($r->input('permissions') ?? []);
        $this->db->run('DELETE FROM role_permissions WHERE role_id = ?', [$roleId]);

        if ($permissionSlugs) {
            $placeholders = implode(',', array_fill(0, count($permissionSlugs), '?'));
            $permRows = $this->db->all(
                "SELECT id FROM permissions WHERE slug IN ($placeholders)",
                $permissionSlugs
            );
            foreach ($permRows as $p) {
                $this->db->run(
                    'INSERT INTO role_permissions (role_id, permission_id) VALUES (?, ?)',
                    [$roleId, $p['id']]
                );
            }
        }
        PermissionService::clearCache();
        $this->activity->log($r, 'update', 'roles', (int) $roleId, $role['slug'] ?? null, ['permissions' => $permissionSlugs]);
        Response::json(['message' => 'Role permissions updated']);
    }

    private function syncPrimaryRole(int $userId, string $roleSlug): void
    {
        try {
            $role = $this->db->one('SELECT id FROM roles WHERE slug = ?', [$roleSlug]);
            if (!$role) {
                return;
            }
            $this->db->run('DELETE FROM user_roles WHERE user_id = ?', [$userId]);
            $this->db->run(
                'INSERT INTO user_roles (user_id, role_id, is_primary) VALUES (?, ?, 1)',
                [$userId, (int) $role['id']]
            );
        } catch (\Throwable) {
            // table may be missing before migration
        }
    }
}
