<?php
declare(strict_types=1);

namespace App\Services;

use App\Database;

final class PermissionService
{
    private static array $cache = [];

    public function __construct(private Database $db) {}

    public static function clearCache(): void
    {
        self::$cache = [];
    }

    public function userPermissions(int $userId, string $roleSlug): array
    {
        $key = "$userId:$roleSlug";
        if (isset(self::$cache[$key])) {
            return self::$cache[$key];
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
    }

    public function can(array $user, string $permission): bool
    {
        $role = (string) ($user['role'] ?? 'editor');
        // Full bypass only for super_admin (MCP token authenticates as super_admin).
        if ($role === 'super_admin') {
            return true;
        }
        try {
            $perms = $this->userPermissions((int) ($user['sub'] ?? 0), $role);
            return in_array($permission, $perms, true);
        } catch (\Throwable) {
            // Roles/permissions tables may be missing before enterprise migration
            return str_starts_with($permission, 'content.') || $permission === 'media.manage';
        }
    }

    public function require(array $user, string $permission): void
    {
        if (!$this->can($user, $permission)) {
            \App\Response::error('Forbidden: insufficient permissions', 403);
        }
    }

    /** Day-to-day site settings (admin + super_admin). */
    public function isSettingsRoute(string $path): bool
    {
        return (bool) preg_match(
            '#/admin/(seo|site-settings|theme|email-settings|password|redirects|translate)(/|$)#',
            $path
        );
    }

    /** Critical system ops (super_admin / MCP only via system.manage). */
    public function isSystemRoute(string $path): bool
    {
        return (bool) preg_match(
            '#/admin/(backup|updates|system|plugins|content-pack|mcp|roles|permissions|ddos)(/|$)#',
            $path
        );
    }

    public function roles(): array
    {
        return $this->db->all('SELECT r.*, COUNT(rp.permission_id) perm_count FROM roles r LEFT JOIN role_permissions rp ON rp.role_id=r.id GROUP BY r.id ORDER BY r.id');
    }

    public function permissions(): array
    {
        return $this->db->all('SELECT * FROM permissions ORDER BY group_name, slug');
    }
}
