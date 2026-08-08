<?php
declare(strict_types=1);

namespace App\Platform\Surfaces;

/**
 * Process-local package surface declarations for host consumers
 * (SoftDelete, Dashboard, Sitemap, MediaUsage, content ACL).
 * Owner-scoped; cleared on package disable/unload.
 * No domain-specific methods — packages register opaque surface defs.
 */
final class PackageSurfaceRegistry
{
    /** @var array<string, array<string, mixed>> ownerSlug => surfaces blob */
    private static array $byOwner = [];

    /**
     * @param array<string, mixed> $surfaces keys: trash, dashboard, sitemap, media, content_acl, schema
     */
    public static function register(string $ownerSlug, array $surfaces): void
    {
        $owner = trim($ownerSlug);
        if ($owner === '' || !preg_match('/^[a-z][a-z0-9-]{1,62}[a-z0-9]$/', $owner)) {
            throw new \InvalidArgumentException('Invalid surface owner slug');
        }
        $prev = self::$byOwner[$owner] ?? [];
        self::$byOwner[$owner] = self::mergeSurfaces($prev, self::sanitize($surfaces));
    }

    public static function clearOwner(string $ownerSlug): int
    {
        $owner = trim($ownerSlug);
        if ($owner === '' || !isset(self::$byOwner[$owner])) {
            return 0;
        }
        unset(self::$byOwner[$owner]);
        return 1;
    }

    /** @return array<string, string> resource => table */
    public static function trashable(): array
    {
        $out = [];
        foreach (self::$byOwner as $owner => $surfaces) {
            foreach (($surfaces['trash'] ?? []) as $row) {
                if (!is_array($row)) {
                    continue;
                }
                $resource = trim((string) ($row['resource'] ?? ''));
                $table = self::safeIdent((string) ($row['table'] ?? ''));
                if ($resource !== '' && $table !== null) {
                    $out[$resource] = $table;
                }
            }
        }
        return $out;
    }

    /** @return list<array<string, mixed>> */
    public static function dashboardMetrics(): array
    {
        $out = [];
        foreach (self::$byOwner as $owner => $surfaces) {
            foreach (($surfaces['dashboard'] ?? []) as $row) {
                if (!is_array($row)) {
                    continue;
                }
                $table = self::safeIdent((string) ($row['table'] ?? ''));
                if ($table === null) {
                    continue;
                }
                $out[] = array_merge($row, ['owner' => $owner, 'table' => $table]);
            }
        }
        return $out;
    }

    /** @return list<array<string, mixed>> */
    public static function sitemapEntries(): array
    {
        $out = [];
        foreach (self::$byOwner as $owner => $surfaces) {
            foreach (($surfaces['sitemap'] ?? []) as $row) {
                if (!is_array($row)) {
                    continue;
                }
                $table = self::safeIdent((string) ($row['table'] ?? ''));
                if ($table === null) {
                    continue;
                }
                $out[] = array_merge($row, ['owner' => $owner, 'table' => $table]);
            }
        }
        return $out;
    }

    /** @return list<array<string, mixed>> */
    public static function mediaCollectors(): array
    {
        $out = [];
        foreach (self::$byOwner as $owner => $surfaces) {
            foreach (($surfaces['media'] ?? []) as $row) {
                if (!is_array($row)) {
                    continue;
                }
                $table = self::safeIdent((string) ($row['table'] ?? ''));
                if ($table === null) {
                    continue;
                }
                $out[] = array_merge($row, ['owner' => $owner, 'table' => $table]);
            }
        }
        return $out;
    }

    /** @return list<string> */
    public static function contentAclResources(): array
    {
        $out = [];
        foreach (self::$byOwner as $surfaces) {
            foreach (($surfaces['content_acl'] ?? []) as $row) {
                if (!is_array($row)) {
                    continue;
                }
                $resource = trim((string) ($row['resource'] ?? ''));
                if ($resource !== '') {
                    $out[] = $resource;
                }
            }
        }
        return array_values(array_unique($out));
    }

    /** @return array<string, string> table => ownerSlug */
    public static function schemaOwners(): array
    {
        $out = [];
        foreach (self::$byOwner as $owner => $surfaces) {
            foreach (($surfaces['schema'] ?? []) as $row) {
                if (!is_array($row)) {
                    continue;
                }
                $table = self::safeIdent((string) ($row['table'] ?? ''));
                $role = trim((string) ($row['role'] ?? 'owner'));
                if ($table !== null && $role === 'owner') {
                    $out[$table] = $owner;
                }
            }
        }
        return $out;
    }

    /** @return list<string> */
    public static function owners(): array
    {
        return array_keys(self::$byOwner);
    }

    /** @return array<string, mixed>|null */
    public static function forOwner(string $ownerSlug): ?array
    {
        return self::$byOwner[trim($ownerSlug)] ?? null;
    }

    public static function resetForTests(): void
    {
        self::$byOwner = [];
    }

    /**
     * @param array<string, mixed> $surfaces
     * @return array<string, mixed>
     */
    private static function sanitize(array $surfaces): array
    {
        $out = [];
        foreach (['trash', 'dashboard', 'sitemap', 'media', 'content_acl', 'schema'] as $key) {
            if (!isset($surfaces[$key]) || !is_array($surfaces[$key])) {
                continue;
            }
            $rows = [];
            foreach ($surfaces[$key] as $row) {
                if (is_array($row)) {
                    $rows[] = $row;
                }
            }
            if ($rows !== []) {
                $out[$key] = $rows;
            }
        }
        return $out;
    }

    /**
     * @param array<string, mixed> $a
     * @param array<string, mixed> $b
     * @return array<string, mixed>
     */
    private static function mergeSurfaces(array $a, array $b): array
    {
        foreach ($b as $key => $rows) {
            $prev = $a[$key] ?? [];
            if (!is_array($prev)) {
                $prev = [];
            }
            $a[$key] = array_merge($prev, is_array($rows) ? $rows : []);
        }
        return $a;
    }

    private static function safeIdent(string $name): ?string
    {
        $name = trim($name);
        if ($name === '' || !preg_match('/^[a-z][a-z0-9_]{0,63}$/', $name)) {
            return null;
        }
        return $name;
    }
}
