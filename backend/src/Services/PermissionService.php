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

        // Machine token — not a JWT role claim.
        if (($user['auth'] ?? '') === 'mcp_token') {
            return true;
        }

        // Prefer live ACL / DB over JWT claims (defeats stale super_admin after demotion).
        $access = AccessHost::tryGet();
        if ($access !== null && $userId > 0) {
            try {
                $bundle = $access->effectiveBundle($userId);
                if ($bundle['is_super'] || $bundle['roles'] !== [] || $bundle['caps'] !== []) {
                    return $access->canCapability(new AccessContext($userId, $permission))->allowed;
                }
            } catch (\Throwable) {
                // fall through
            }
        }

        // Resolve role from DB when the user row exists — JWT role alone is not authoritative.
        if ($userId > 0) {
            $live = $this->liveRoleSlug($userId);
            if ($live !== null) {
                $role = $live;
            }
        }

        if ($role === 'super_admin') {
            return true;
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

    /** @return string|null null = no users row (tests / ephemeral JWT-only) */
    private function liveRoleSlug(int $userId): ?string
    {
        try {
            $row = $this->db->one('SELECT role FROM users WHERE id = ? LIMIT 1', [$userId]);
            if ($row === null) {
                return null;
            }
            return (string) ($row['role'] ?? 'editor');
        } catch (\Throwable) {
            return null;
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

    /**
     * Require any one of the listed capabilities (first is used in the 403 payload).
     *
     * @param list<string> $permissions
     */
    public function requireAny(array $user, array $permissions): void
    {
        foreach ($permissions as $permission) {
            if ($this->can($user, $permission)) {
                return;
            }
        }
        $this->require($user, $permissions[0] ?? 'content.update');
    }

    /**
     * Admin CRUD resources gated by content.* capabilities (Content / Blog / Projects modules).
     *
     * @return list<string>
     */
    public static function contentResources(): array
    {
        return [
            'social-links', 'statistics', 'experience', 'education', 'skill-categories', 'skills',
            'blog-categories', 'blog-tags', 'testimonials', 'navigation', 'homepage-sections', 'pages',
            'services', 'projects', 'project-categories', 'blog',
        ];
    }

    public function isContentResource(string $resource): bool
    {
        return in_array($resource, self::contentResources(), true);
    }

    /**
     * Content create / update / delete / publish / restore capability check.
     * Accepts legacy aliases (content.update ↔ content.edit_any) and edit_own / pages.manage
     * so author/editor roles keep working without hardcoded role names.
     */
    public function canMutateContent(array $user, string $op): bool
    {
        return match ($op) {
            'create' => $this->can($user, 'content.create') || $this->can($user, 'pages.manage'),
            'delete' => $this->can($user, 'content.delete')
                || $this->can($user, 'content.delete_any')
                || $this->can($user, 'content.delete_own')
                || $this->can($user, 'pages.manage'),
            'publish' => $this->can($user, 'content.publish')
                || $this->can($user, 'content.publish_own')
                || $this->can($user, 'pages.manage')
                || $this->canMutateContent($user, 'update'),
            default => $this->can($user, 'content.update')
                || $this->can($user, 'content.edit_any')
                || $this->can($user, 'content.edit_own')
                || $this->can($user, 'pages.manage'),
        };
    }

    public function requireContentMutation(array $user, string $op): void
    {
        if ($this->canMutateContent($user, $op)) {
            return;
        }
        $primary = match ($op) {
            'create' => 'content.create',
            'delete' => 'content.delete',
            'publish' => 'content.publish',
            default => 'content.update',
        };
        $this->require($user, $primary);
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
