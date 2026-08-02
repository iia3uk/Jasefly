<?php
declare(strict_types=1);

namespace App\Services;

use App\Database;
use App\Platform\Access\AccessHost;
use App\Platform\Access\Acl\AccessContext;
use App\Platform\Access\Acl\AclEffectiveCache;
use App\Response;

/**
 * Admin permission adapter — delegates to Platform Access ACL when available.
 * Keeps legacy can(user, permissionSlug) signatures for modules/middleware.
 */
final class PermissionService
{
    private static array $cache = [];

    public function __construct(private Database $db) {}

    public static function clearCache(): void
    {
        self::$cache = [];
        AclEffectiveCache::forget();
    }

    public function userPermissions(int $userId, string $roleSlug = ''): array
    {
        $access = AccessHost::tryGet();
        if ($access !== null && $userId > 0) {
            return $access->effectiveCapabilities($userId);
        }
        $key = "$userId:$roleSlug";
        if (isset(self::$cache[$key])) {
            return self::$cache[$key];
        }
        try {
            if ($userId > 0) {
                $rows = $this->db->all(
                    'SELECT DISTINCT p.slug FROM permissions p
                     INNER JOIN role_permissions rp ON rp.permission_id = p.id
                     INNER JOIN roles r ON r.id = rp.role_id
                     INNER JOIN user_roles ur ON ur.role_id = r.id
                     WHERE ur.user_id = ?',
                    [$userId]
                );
                if ($rows !== []) {
                    self::$cache[$key] = array_column($rows, 'slug');
                    return self::$cache[$key];
                }
            }
            $rows = $this->db->all(
                'SELECT p.slug FROM permissions p
                 INNER JOIN role_permissions rp ON rp.permission_id = p.id
                 INNER JOIN roles r ON r.id = rp.role_id
                 WHERE r.slug = ?',
                [$roleSlug]
            );
            self::$cache[$key] = array_column($rows, 'slug');
            return self::$cache[$key];
        } catch (\Throwable) {
            return [];
        }
    }

    public function can(array $user, string $permission): bool
    {
        $userId = (int) ($user['sub'] ?? $user['id'] ?? 0);
        $role = (string) ($user['role'] ?? 'editor');

        // Demo sandbox: never super / mcp bypass — DemoCapabilityPolicy only.
        $isDemo = !empty($user['is_demo'])
            || ($user['auth'] ?? '') === 'demo'
            || ($user['type'] ?? '') === 'demo_access'
            || \App\Modules\Demo\DemoContextHolder::isDemo();
        if ($isDemo) {
            return \App\Modules\Demo\DemoCapabilityPolicy::allows($permission);
        }

        if ($role === 'super_admin' || ($user['auth'] ?? '') === 'mcp_token') {
            return true;
        }

        $access = AccessHost::tryGet();
        if ($access !== null && $userId > 0) {
            try {
                $bundle = $access->effectiveBundle($userId);
                // Prefer ACL when the user has DB roles/caps; otherwise JWT role matrix (tests / pre-backfill).
                if ($bundle['is_super'] || $bundle['roles'] !== [] || $bundle['caps'] !== []) {
                    return $access->canCapability(new AccessContext($userId, $permission))->allowed;
                }
            } catch (\Throwable) {
                // fall through to role-slug matrix
            }
        }

        try {
            $perms = $this->userPermissions($userId, $role);
            if (in_array($permission, $perms, true)) {
                return true;
            }
            $aliases = [
                'content.edit_any' => 'content.update',
                'content.update' => 'content.edit_any',
                'content.delete_any' => 'content.delete',
                'content.delete' => 'content.delete_any',
            ];
            $alt = $aliases[$permission] ?? null;
            return $alt !== null && in_array($alt, $perms, true);
        } catch (\Throwable) {
            return str_starts_with($permission, 'content.') || $permission === 'media.manage';
        }
    }

    public function require(array $user, string $permission): void
    {
        if (!$this->can($user, $permission)) {
            Response::error('Forbidden: insufficient permissions', 403, [], [
                'code' => 'forbidden',
                'capability' => $permission,
            ]);
        }
    }

    public function isSettingsRoute(string $path): bool
    {
        return (bool) preg_match(
            '#/admin/(seo|site-settings|theme|email-settings|password|redirects|translate)(/|$)#',
            $path
        );
    }

    public function isSystemRoute(string $path): bool
    {
        return (bool) preg_match(
            '#/admin/(backup|updates|system|plugins|content-pack|mcp|roles|permissions|ddos|access)(/|$)#',
            $path
        );
    }

    /** Map admin path prefix → required capability (fail-closed unknown left to handlers). */
    public function capabilityForAdminPath(string $path): ?string
    {
        if ($this->isSystemRoute($path)) {
            if (str_contains($path, '/admin/plugins')) {
                return 'plugins.manage';
            }
            if (str_contains($path, '/admin/mcp')) {
                return 'mcp.manage';
            }
            if (str_contains($path, '/admin/updates') || str_contains($path, '/admin/backup')) {
                return 'system.updates';
            }
            if (str_contains($path, '/admin/access/bootstrap') || str_contains($path, '/admin/access/batch-can')) {
                return 'dashboard.view'; // any logged-in admin shell user
            }
            if (str_contains($path, '/admin/access')) {
                return 'access.manage';
            }
            if (str_contains($path, '/admin/roles') || str_contains($path, '/admin/permissions')) {
                return 'roles.manage';
            }
            return 'system.manage';
        }
        if ($this->isSettingsRoute($path)) {
            return str_contains($path, '/admin/seo') ? 'seo.manage' : 'settings.manage';
        }
        if (str_contains($path, '/admin/users')) {
            return 'users.view';
        }
        if (str_contains($path, '/admin/modules')) {
            return 'modules.view';
        }
        if (str_contains($path, '/admin/media')) {
            return 'media.manage';
        }
        return null;
    }

    public function roles(): array
    {
        try {
            return $this->db->all(
                'SELECT r.*, COUNT(rp.permission_id) perm_count FROM roles r
                 LEFT JOIN role_permissions rp ON rp.role_id=r.id
                 GROUP BY r.id ORDER BY r.role_rank ASC, r.id ASC'
            );
        } catch (\Throwable) {
            return $this->db->all(
                'SELECT r.*, COUNT(rp.permission_id) perm_count FROM roles r
                 LEFT JOIN role_permissions rp ON rp.role_id=r.id
                 GROUP BY r.id ORDER BY r.id'
            );
        }
    }

    public function permissions(): array
    {
        return $this->db->all('SELECT * FROM permissions ORDER BY group_name, slug');
    }
}
