<?php
declare(strict_types=1);

namespace App\Platform\Capabilities;

use App\Database;
use App\Platform\Contracts\PlatformCapabilitiesInterface;

final class CapabilityRegistry implements PlatformCapabilitiesInterface
{
    /** @var array<string, list<array{provider:string, module_slug:?string, priority:int}>> */
    private array $memory = [];

    public function __construct(private ?Database $db = null)
    {
        $this->loadFromDb();
        $this->ensureCoreDefaults();
    }

    public function register(string $capability, string $provider, ?string $moduleSlug = null, int $priority = 100): void
    {
        $this->memory[$capability] ??= [];
        foreach ($this->memory[$capability] as $i => $row) {
            if ($row['provider'] === $provider) {
                $this->memory[$capability][$i] = [
                    'provider' => $provider,
                    'module_slug' => $moduleSlug,
                    'priority' => $priority,
                ];
                $this->persist($capability, $provider, $moduleSlug, $priority);
                return;
            }
        }
        $this->memory[$capability][] = [
            'provider' => $provider,
            'module_slug' => $moduleSlug,
            'priority' => $priority,
        ];
        $this->persist($capability, $provider, $moduleSlug, $priority);
    }

    public function revokeModule(string $moduleSlug): void
    {
        foreach ($this->memory as $cap => $rows) {
            $this->memory[$cap] = array_values(array_filter(
                $rows,
                static fn(array $r) => ($r['module_slug'] ?? null) !== $moduleSlug
            ));
        }
        if ($this->db === null) {
            return;
        }
        try {
            $this->db->run('DELETE FROM platform_capabilities WHERE module_slug=?', [$moduleSlug]);
        } catch (\Throwable) {
        }
    }

    public function has(string $capability): bool
    {
        return $this->resolveProvider($capability) !== null;
    }

    public function require(string $capability): void
    {
        if (!$this->has($capability)) {
            throw new \RuntimeException('Missing platform capability: ' . $capability);
        }
    }

    public function resolveProvider(string $capability): ?string
    {
        if ($this->db !== null) {
            try {
                $override = $this->db->one(
                    'SELECT provider FROM platform_capability_overrides WHERE capability=? LIMIT 1',
                    [$capability]
                );
                if ($override && !empty($override['provider'])) {
                    return (string) $override['provider'];
                }
            } catch (\Throwable) {
            }
        }
        $rows = $this->memory[$capability] ?? [];
        if ($rows === []) {
            return null;
        }
        usort($rows, static fn(array $a, array $b) => ($b['priority'] <=> $a['priority']));
        return (string) ($rows[0]['provider'] ?? null);
    }

    public function list(): array
    {
        return array_keys($this->memory);
    }

    /** @return array<string, list<array{provider:string, module_slug:?string, priority:int}>> */
    public function dump(): array
    {
        return $this->memory;
    }

    private function loadFromDb(): void
    {
        if ($this->db === null) {
            return;
        }
        try {
            $rows = $this->db->all(
                'SELECT capability, provider, module_slug, priority FROM platform_capabilities WHERE is_active=1'
            );
            foreach ($rows as $row) {
                $cap = (string) $row['capability'];
                $this->memory[$cap] ??= [];
                $this->memory[$cap][] = [
                    'provider' => (string) $row['provider'],
                    'module_slug' => $row['module_slug'] !== null ? (string) $row['module_slug'] : null,
                    'priority' => (int) $row['priority'],
                ];
            }
        } catch (\Throwable) {
            // table may not exist yet
        }
    }

    private function ensureCoreDefaults(): void
    {
        $defaults = [
            'mail.send', 'scheduler.jobs', 'storage.files', 'builder.widgets', 'builder.inspector',
            'notifications.send', 'media.library', 'users.roles', 'events.publish', 'events.subscribe',
            'http.client', 'settings.global', 'settings.module', 'analytics.events', 'permissions.check',
            'content.pages', 'admin.pages', 'public.routes', 'api.routes', 'users.current',
        ];
        foreach ($defaults as $cap) {
            if (!isset($this->memory[$cap]) || $this->memory[$cap] === []) {
                $this->memory[$cap] = [[
                    'provider' => 'core.' . explode('.', $cap)[0],
                    'module_slug' => null,
                    'priority' => 100,
                ]];
            }
        }
    }

    private function persist(string $capability, string $provider, ?string $moduleSlug, int $priority): void
    {
        if ($this->db === null) {
            return;
        }
        try {
            $this->db->run(
                'INSERT INTO platform_capabilities (capability, provider, module_slug, priority, is_active)
                 VALUES (?, ?, ?, ?, 1)
                 ON DUPLICATE KEY UPDATE module_slug=VALUES(module_slug), priority=VALUES(priority), is_active=1',
                [$capability, $provider, $moduleSlug, $priority]
            );
        } catch (\Throwable) {
        }
    }
}
