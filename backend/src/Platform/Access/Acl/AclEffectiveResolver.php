<?php
declare(strict_types=1);

namespace App\Platform\Access\Acl;

use App\Database;
use App\Platform\Access\AccessDecision;

/**
 * Compute effective capabilities: deny overrides > allow overrides > role union.
 * Super role (is_super) grants all known capabilities.
 */
final class AclEffectiveResolver
{
    public function __construct(
        private Database $db,
        private AclCapabilityCatalog $catalog,
    ) {}

    /**
     * @return array{caps: list<string>, is_super: bool, roles: list<string>, version: string}
     */
    public function resolve(int $userId): array
    {
        if ($userId <= 0) {
            return ['caps' => [], 'is_super' => false, 'roles' => [], 'version' => '0'];
        }
        $cached = AclEffectiveCache::get($userId);
        if ($cached !== null) {
            return $cached;
        }

        $roles = $this->userRoleSlugs($userId);
        $isSuper = $this->userIsSuper($userId, $roles);
        $fromRoles = $isSuper ? $this->allCapabilitySlugs() : $this->capabilitiesForRoles($roles);
        $overrides = $this->overridesForUser($userId);

        $set = array_fill_keys($fromRoles, true);
        foreach ($overrides as $slug => $effect) {
            if ($effect === 'deny') {
                unset($set[$slug]);
                foreach ($this->catalog->expandEquivalents($slug) as $eq) {
                    unset($set[$eq]);
                }
            } elseif ($effect === 'allow') {
                $set[$slug] = true;
                foreach ($this->catalog->expandEquivalents($slug) as $eq) {
                    $set[$eq] = true;
                }
            }
        }

        // Legacy bundles
        if (isset($set['users.manage'])) {
            foreach (['users.view', 'users.create', 'users.edit', 'users.delete', 'roles.manage', 'access.manage'] as $u) {
                $set[$u] = true;
            }
        }
        if (isset($set['system.manage'])) {
            foreach (['system.diagnostics', 'system.logs', 'system.updates', 'system.security', 'plugins.manage', 'mcp.manage', 'modules.view', 'modules.install', 'modules.enable', 'modules.update', 'modules.delete', 'deploy.execute'] as $s) {
                $set[$s] = true;
            }
        }
        if (isset($set['content.update'])) {
            $set['content.edit_any'] = true;
        }
        if (isset($set['content.edit_any'])) {
            $set['content.update'] = true;
        }
        if (isset($set['content.delete'])) {
            $set['content.delete_any'] = true;
        }
        if (isset($set['content.delete_any'])) {
            $set['content.delete'] = true;
        }

        $caps = array_keys($set);
        sort($caps);
        $payload = [
            'caps' => $caps,
            'is_super' => $isSuper,
            'roles' => $roles,
            'version' => substr(hash('sha256', implode(',', $caps) . '|' . ($isSuper ? '1' : '0')), 0, 16),
        ];
        AclEffectiveCache::set($userId, $payload);
        return $payload;
    }

    public function can(AccessContext $ctx): AccessDecision
    {
        $cap = trim($ctx->capability);
        if ($cap === '') {
            return AccessDecision::deny('Empty capability', 'capability');
        }
        if ($ctx->userId === null || $ctx->userId <= 0) {
            return AccessDecision::deny('Authentication required', 'capability');
        }
        if (!$this->catalog->has($cap) && !$this->legacyKnown($cap)) {
            return AccessDecision::deny('Unknown capability: ' . $cap, 'capability', ['fail_closed' => true]);
        }

        $resolved = $this->resolve($ctx->userId);
        if ($resolved['is_super']) {
            return AccessDecision::allow('capability', ['source' => 'super', 'capability' => $cap]);
        }

        $equivalents = $this->catalog->expandEquivalents($cap);
        $has = false;
        foreach ($equivalents as $eq) {
            if (in_array($eq, $resolved['caps'], true)) {
                $has = true;
                break;
            }
        }
        if (!$has) {
            return AccessDecision::deny('Missing capability: ' . $cap, 'capability', [
                'capability' => $cap,
                'source' => 'none',
            ]);
        }

        // own/any scope enforcement when resource owner provided
        if ($ctx->scope === 'own' || str_ends_with($cap, '_own') || str_contains($cap, '.edit_own') || str_contains($cap, '.delete_own') || str_contains($cap, '.publish_own')) {
            if ($ctx->resourceOwnerId !== null && $ctx->resourceOwnerId !== $ctx->userId) {
                // need any-variant
                $anyCap = str_replace(['_own', '.edit_own', '.delete_own', '.publish_own'], ['_any', '.edit_any', '.delete_any', '.publish'], $cap);
                $anyOk = false;
                foreach ($this->catalog->expandEquivalents($anyCap) as $eq) {
                    if (in_array($eq, $resolved['caps'], true)) {
                        $anyOk = true;
                        break;
                    }
                }
                // also content.update / content.edit_any
                if (!$anyOk) {
                    foreach (['content.edit_any', 'content.update'] as $eq) {
                        if (str_starts_with($cap, 'content.') && in_array($eq, $resolved['caps'], true)) {
                            $anyOk = true;
                            break;
                        }
                    }
                }
                if (!$anyOk) {
                    return AccessDecision::deny('Own-scope only; resource owned by another user', 'capability', [
                        'capability' => $cap,
                        'scope' => 'own',
                    ]);
                }
            }
        }

        return AccessDecision::allow('capability', ['source' => 'effective', 'capability' => $cap]);
    }

    /** @return array<string, mixed> */
    public function explain(int $userId, string $capability): array
    {
        $capability = trim($capability);
        $resolved = $this->resolve($userId);
        $decision = $this->can(new AccessContext($userId, $capability));
        $sources = [];
        if ($resolved['is_super']) {
            $sources[] = ['type' => 'super', 'detail' => 'is_super role'];
        }
        $overrides = $this->overridesForUser($userId);
        foreach ($this->catalog->expandEquivalents($capability) as $eq) {
            if (isset($overrides[$eq])) {
                $sources[] = ['type' => 'override', 'effect' => $overrides[$eq], 'capability' => $eq];
            }
        }
        foreach ($resolved['roles'] as $role) {
            $roleCaps = $this->capabilitiesForRoles([$role]);
            foreach ($this->catalog->expandEquivalents($capability) as $eq) {
                if (in_array($eq, $roleCaps, true)) {
                    $sources[] = ['type' => 'role', 'role' => $role, 'capability' => $eq];
                    break;
                }
            }
        }
        return [
            'capability' => $capability,
            'allowed' => $decision->allowed,
            'reason' => $decision->reason,
            'is_super' => $resolved['is_super'],
            'roles' => $resolved['roles'],
            'sources' => $sources,
            'provider' => 'capability',
        ];
    }

    /** @return list<string> */
    public function userRoleSlugs(int $userId): array
    {
        try {
            $rows = $this->db->all(
                'SELECT r.slug FROM user_roles ur
                 INNER JOIN roles r ON r.id = ur.role_id
                 WHERE ur.user_id = ?
                 ORDER BY r.role_rank ASC, r.id ASC',
                [$userId]
            );
            $slugs = array_values(array_unique(array_map(static fn(array $r): string => (string) $r['slug'], $rows)));
            if ($slugs !== []) {
                return $slugs;
            }
        } catch (\Throwable) {
            // fall through to legacy column
        }
        try {
            $row = $this->db->one('SELECT role FROM users WHERE id = ? LIMIT 1', [$userId]);
            $role = trim((string) ($row['role'] ?? ''));
            return $role !== '' ? [$role] : [];
        } catch (\Throwable) {
            return [];
        }
    }

    /** @param list<string> $roles */
    private function userIsSuper(int $userId, array $roles): bool
    {
        if (in_array('super_admin', $roles, true)) {
            return true;
        }
        try {
            $row = $this->db->one(
                'SELECT 1 AS ok FROM user_roles ur
                 INNER JOIN roles r ON r.id = ur.role_id
                 WHERE ur.user_id = ? AND r.is_super = 1 LIMIT 1',
                [$userId]
            );
            return $row !== null;
        } catch (\Throwable) {
            return in_array('super_admin', $roles, true);
        }
    }

    /** @param list<string> $roles @return list<string> */
    private function capabilitiesForRoles(array $roles): array
    {
        if ($roles === []) {
            return [];
        }
        $placeholders = implode(',', array_fill(0, count($roles), '?'));
        try {
            $rows = $this->db->all(
                "SELECT DISTINCT p.slug FROM permissions p
                 INNER JOIN role_permissions rp ON rp.permission_id = p.id
                 INNER JOIN roles r ON r.id = rp.role_id
                 WHERE r.slug IN ($placeholders) AND (p.is_active = 1 OR p.is_active IS NULL)",
                $roles
            );
            return array_column($rows, 'slug');
        } catch (\Throwable) {
            try {
                $rows = $this->db->all(
                    "SELECT DISTINCT p.slug FROM permissions p
                     INNER JOIN role_permissions rp ON rp.permission_id = p.id
                     INNER JOIN roles r ON r.id = rp.role_id
                     WHERE r.slug IN ($placeholders)",
                    $roles
                );
                return array_column($rows, 'slug');
            } catch (\Throwable) {
                return [];
            }
        }
    }

    /** @return array<string, 'allow'|'deny'> */
    private function overridesForUser(int $userId): array
    {
        try {
            $rows = $this->db->all(
                'SELECT capability_slug, effect FROM user_capability_overrides WHERE user_id = ?',
                [$userId]
            );
            $out = [];
            foreach ($rows as $row) {
                $effect = (string) ($row['effect'] ?? '');
                if ($effect === 'allow' || $effect === 'deny') {
                    $out[(string) $row['capability_slug']] = $effect;
                }
            }
            return $out;
        } catch (\Throwable) {
            return [];
        }
    }

    /** @return list<string> */
    private function allCapabilitySlugs(): array
    {
        return array_map(static fn(array $c): string => (string) $c['slug'], $this->catalog->list());
    }

    private function legacyKnown(string $cap): bool
    {
        return str_contains($cap, '.');
    }
}
