<?php
declare(strict_types=1);

namespace App\Platform\Access\Acl;

use App\Database;

/**
 * User ACL capability catalog (not Platform feature CapabilityRegistry).
 * Core seed + ZIP registerCapability().
 */
final class AclCapabilityCatalog
{
    /** @var array<string, array<string, mixed>> */
    private array $runtime = [];

    /** @var array<string, string> alias → target */
    private array $aliases = [];

    public function __construct(private ?Database $db = null)
    {
        $this->loadAliasesFromDb();
        $this->registerCoreDefaults();
    }

    /** @param array<string, mixed> $def */
    public function register(array $def): void
    {
        $slug = trim((string) ($def['slug'] ?? ''));
        if ($slug === '') {
            throw new \InvalidArgumentException('Capability slug required');
        }
        $this->runtime[$slug] = [
            'slug' => $slug,
            'label' => (string) ($def['label'] ?? $def['name'] ?? $slug),
            'description' => (string) ($def['description'] ?? ''),
            'group' => (string) ($def['group'] ?? $def['group_name'] ?? 'other'),
            'risk' => (string) ($def['risk'] ?? $def['risk_level'] ?? 'low'),
            'scope_default' => (string) ($def['scope_default'] ?? 'site'),
            'default_roles' => is_array($def['default_roles'] ?? null) ? array_values($def['default_roles']) : [],
            'source' => (string) ($def['source'] ?? 'runtime'),
        ];
        if ($this->db) {
            try {
                $this->db->run(
                    'INSERT INTO permissions (slug, name, group_name, description, risk_level, scope_default, is_active)
                     VALUES (?, ?, ?, ?, ?, ?, 1)
                     ON DUPLICATE KEY UPDATE name=VALUES(name), group_name=VALUES(group_name),
                       description=VALUES(description), risk_level=VALUES(risk_level), scope_default=VALUES(scope_default)',
                    [
                        $slug,
                        $this->runtime[$slug]['label'],
                        $this->runtime[$slug]['group'],
                        $this->runtime[$slug]['description'],
                        $this->runtime[$slug]['risk'],
                        $this->runtime[$slug]['scope_default'],
                    ]
                );
                foreach ($this->runtime[$slug]['default_roles'] as $roleSlug) {
                    $roleSlug = trim((string) $roleSlug);
                    if ($roleSlug === '') {
                        continue;
                    }
                    $this->db->run(
                        'INSERT IGNORE INTO role_permissions (role_id, permission_id)
                         SELECT r.id, p.id FROM roles r, permissions p
                         WHERE r.slug = ? AND p.slug = ?',
                        [$roleSlug, $slug]
                    );
                }
            } catch (\Throwable) {
                // Catalog still usable in-memory before migrations.
            }
        }
        AclEffectiveCache::forget();
    }

    public function has(string $slug): bool
    {
        $canonical = $this->resolveAlias($slug);
        if (isset($this->runtime[$canonical])) {
            return true;
        }
        if (!$this->db) {
            return false;
        }
        try {
            $row = $this->db->one('SELECT id FROM permissions WHERE slug = ? AND is_active = 1 LIMIT 1', [$canonical]);
            return $row !== null;
        } catch (\Throwable) {
            return isset($this->runtime[$canonical]);
        }
    }

    public function resolveAlias(string $slug): string
    {
        $slug = trim($slug);
        return $this->aliases[$slug] ?? $slug;
    }

    /** Expand a requested slug to all equivalent slugs that grant the same right. */
    public function expandEquivalents(string $slug): array
    {
        $slug = trim($slug);
        $out = [$slug];
        $canonical = $this->resolveAlias($slug);
        if ($canonical !== $slug) {
            $out[] = $canonical;
        }
        foreach ($this->aliases as $alias => $target) {
            if ($target === $slug || $target === $canonical || $alias === $canonical) {
                $out[] = $alias;
                $out[] = $target;
            }
        }
        // Bidirectional content aliases
        $pairs = [
            'content.update' => 'content.edit_any',
            'content.delete' => 'content.delete_any',
            'content.publish' => 'content.publish',
        ];
        foreach ($pairs as $a => $b) {
            if ($slug === $a || $slug === $b || $canonical === $a || $canonical === $b) {
                $out[] = $a;
                $out[] = $b;
            }
        }
        return array_values(array_unique($out));
    }

    /** @return list<array<string, mixed>> */
    public function list(): array
    {
        $bySlug = $this->runtime;
        if ($this->db) {
            try {
                foreach ($this->db->all('SELECT slug, name, group_name, description, risk_level, scope_default FROM permissions WHERE is_active = 1') as $row) {
                    $slug = (string) $row['slug'];
                    if (!isset($bySlug[$slug])) {
                        $bySlug[$slug] = [
                            'slug' => $slug,
                            'label' => (string) $row['name'],
                            'description' => (string) ($row['description'] ?? ''),
                            'group' => (string) ($row['group_name'] ?? 'other'),
                            'risk' => (string) ($row['risk_level'] ?? 'low'),
                            'scope_default' => (string) ($row['scope_default'] ?? 'site'),
                            'default_roles' => [],
                            'source' => 'db',
                        ];
                    }
                }
            } catch (\Throwable) {
                // runtime only
            }
        }
        $list = array_values($bySlug);
        usort($list, static fn(array $a, array $b): int => strcmp((string) $a['slug'], (string) $b['slug']));
        return $list;
    }

    private function loadAliasesFromDb(): void
    {
        $this->aliases = [
            'content.update' => 'content.edit_any',
            'content.delete' => 'content.delete_any',
        ];
        if (!$this->db) {
            return;
        }
        try {
            foreach ($this->db->all('SELECT alias_slug, target_slug FROM permission_aliases') as $row) {
                $this->aliases[(string) $row['alias_slug']] = (string) $row['target_slug'];
            }
        } catch (\Throwable) {
            // table may not exist yet
        }
    }

    private function registerCoreDefaults(): void
    {
        $defs = [
            ['slug' => 'dashboard.view', 'label' => 'View dashboard', 'group' => 'dashboard', 'risk' => 'low'],
            ['slug' => 'content.view', 'label' => 'View content', 'group' => 'content', 'risk' => 'low'],
            ['slug' => 'content.create', 'label' => 'Create content', 'group' => 'content', 'risk' => 'low'],
            ['slug' => 'content.update', 'label' => 'Update content (legacy)', 'group' => 'content', 'risk' => 'medium'],
            ['slug' => 'content.edit_own', 'label' => 'Edit own content', 'group' => 'content', 'risk' => 'low', 'scope_default' => 'own'],
            ['slug' => 'content.edit_any', 'label' => 'Edit any content', 'group' => 'content', 'risk' => 'medium', 'scope_default' => 'any'],
            ['slug' => 'content.delete', 'label' => 'Delete content (legacy)', 'group' => 'content', 'risk' => 'high'],
            ['slug' => 'content.delete_own', 'label' => 'Delete own content', 'group' => 'content', 'risk' => 'medium', 'scope_default' => 'own'],
            ['slug' => 'content.delete_any', 'label' => 'Delete any content', 'group' => 'content', 'risk' => 'high', 'scope_default' => 'any'],
            ['slug' => 'content.publish', 'label' => 'Publish content', 'group' => 'content', 'risk' => 'medium'],
            ['slug' => 'content.publish_own', 'label' => 'Publish own content', 'group' => 'content', 'risk' => 'medium', 'scope_default' => 'own'],
            ['slug' => 'content.restore', 'label' => 'Restore content', 'group' => 'content', 'risk' => 'medium'],
            ['slug' => 'content.force_delete', 'label' => 'Force delete', 'group' => 'content', 'risk' => 'critical'],
            ['slug' => 'media.manage', 'label' => 'Manage media', 'group' => 'media', 'risk' => 'medium'],
            ['slug' => 'builder.use', 'label' => 'Use builder', 'group' => 'builder', 'risk' => 'medium'],
            ['slug' => 'builder.publish', 'label' => 'Publish from builder', 'group' => 'builder', 'risk' => 'high'],
            ['slug' => 'pages.manage', 'label' => 'Manage pages', 'group' => 'pages', 'risk' => 'medium'],
            ['slug' => 'navigation.manage', 'label' => 'Manage navigation', 'group' => 'navigation', 'risk' => 'medium'],
            ['slug' => 'users.manage', 'label' => 'Manage users (legacy)', 'group' => 'users', 'risk' => 'critical'],
            ['slug' => 'users.view', 'label' => 'View users', 'group' => 'users', 'risk' => 'medium'],
            ['slug' => 'users.create', 'label' => 'Create users', 'group' => 'users', 'risk' => 'high'],
            ['slug' => 'users.edit', 'label' => 'Edit users', 'group' => 'users', 'risk' => 'high'],
            ['slug' => 'users.delete', 'label' => 'Delete users', 'group' => 'users', 'risk' => 'critical'],
            ['slug' => 'roles.manage', 'label' => 'Manage roles', 'group' => 'roles', 'risk' => 'critical', 'scope_default' => 'platform'],
            ['slug' => 'access.manage', 'label' => 'Manage access', 'group' => 'access', 'risk' => 'critical', 'scope_default' => 'platform'],
            ['slug' => 'settings.manage', 'label' => 'Manage settings', 'group' => 'settings', 'risk' => 'high'],
            ['slug' => 'settings.view', 'label' => 'View settings', 'group' => 'settings', 'risk' => 'low'],
            ['slug' => 'seo.manage', 'label' => 'Manage SEO', 'group' => 'seo', 'risk' => 'medium'],
            ['slug' => 'system.manage', 'label' => 'System manage (legacy)', 'group' => 'system', 'risk' => 'critical', 'scope_default' => 'platform'],
            ['slug' => 'system.diagnostics', 'label' => 'Diagnostics', 'group' => 'system', 'risk' => 'high', 'scope_default' => 'platform'],
            ['slug' => 'system.logs', 'label' => 'System logs', 'group' => 'system', 'risk' => 'medium', 'scope_default' => 'platform'],
            ['slug' => 'system.updates', 'label' => 'System updates', 'group' => 'system', 'risk' => 'critical', 'scope_default' => 'platform'],
            ['slug' => 'system.security', 'label' => 'System security', 'group' => 'system', 'risk' => 'critical', 'scope_default' => 'platform'],
            ['slug' => 'modules.view', 'label' => 'View modules', 'group' => 'modules', 'risk' => 'medium', 'scope_default' => 'platform'],
            ['slug' => 'modules.install', 'label' => 'Install modules', 'group' => 'modules', 'risk' => 'critical', 'scope_default' => 'platform'],
            ['slug' => 'modules.enable', 'label' => 'Enable modules', 'group' => 'modules', 'risk' => 'high', 'scope_default' => 'platform'],
            ['slug' => 'modules.update', 'label' => 'Update modules', 'group' => 'modules', 'risk' => 'critical', 'scope_default' => 'platform'],
            ['slug' => 'modules.delete', 'label' => 'Delete modules', 'group' => 'modules', 'risk' => 'critical', 'scope_default' => 'platform'],
            ['slug' => 'plugins.manage', 'label' => 'Manage plugins', 'group' => 'plugins', 'risk' => 'high', 'scope_default' => 'platform'],
            ['slug' => 'mcp.manage', 'label' => 'Manage MCP', 'group' => 'mcp', 'risk' => 'critical', 'scope_default' => 'platform'],
            ['slug' => 'deploy.execute', 'label' => 'Execute deploy', 'group' => 'deploy', 'risk' => 'critical', 'scope_default' => 'platform'],
            ['slug' => 'activity.view', 'label' => 'View activity', 'group' => 'system', 'risk' => 'low'],
            ['slug' => 'commerce.manage', 'label' => 'Manage commerce', 'group' => 'commerce', 'risk' => 'high'],
            ['slug' => 'orders.view', 'label' => 'View orders', 'group' => 'orders', 'risk' => 'medium'],
            ['slug' => 'orders.manage', 'label' => 'Manage orders', 'group' => 'orders', 'risk' => 'high'],
            ['slug' => 'integrations.manage', 'label' => 'Manage integrations', 'group' => 'integrations', 'risk' => 'high'],
        ];
        foreach ($defs as $d) {
            $slug = $d['slug'];
            if (!isset($this->runtime[$slug])) {
                $this->runtime[$slug] = [
                    'slug' => $slug,
                    'label' => $d['label'],
                    'description' => '',
                    'group' => $d['group'],
                    'risk' => $d['risk'],
                    'scope_default' => $d['scope_default'] ?? 'site',
                    'default_roles' => [],
                    'source' => 'core',
                ];
            }
        }
    }
}
