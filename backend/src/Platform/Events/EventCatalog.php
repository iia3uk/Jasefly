<?php
declare(strict_types=1);

namespace App\Platform\Events;

/**
 * Metadata / discovery registry for package-declared public events.
 *
 * NOT an event bus — EventDispatcher remains the sole publish/subscribe runtime.
 * Automation (and admin UIs) query this catalog for available trigger ids.
 */
final class EventCatalog
{
    /** @var array<string, array{id:string, owner:string, label:string, category:string, payload:array<string,mixed>}> */
    private static array $events = [];

    /**
     * @param array{label?:string, category?:string, payload?:array<string,mixed>} $meta
     */
    public static function declare(string $id, string $ownerSlug, array $meta = []): void
    {
        $id = trim($id);
        $ownerSlug = trim($ownerSlug);
        if ($id === '' || !preg_match('/^[a-z][a-z0-9]*(?:\.[a-z][a-z0-9_-]*)+$/', $id)) {
            throw new \InvalidArgumentException('Invalid public event id');
        }
        if ($ownerSlug === '' || !preg_match('/^[a-z0-9]+(?:-[a-z0-9]+)*$/', $ownerSlug)) {
            throw new \InvalidArgumentException('Invalid event owner slug');
        }
        $existing = self::$events[$id] ?? null;
        if ($existing !== null && ($existing['owner'] ?? '') !== $ownerSlug) {
            throw new \RuntimeException('Event id already declared by another owner: ' . $id);
        }
        self::$events[$id] = [
            'id' => $id,
            'owner' => $ownerSlug,
            'label' => (string) ($meta['label'] ?? $id),
            'category' => (string) ($meta['category'] ?? 'general'),
            'payload' => is_array($meta['payload'] ?? null) ? $meta['payload'] : [],
        ];
    }

    public static function clearOwner(string $slug): int
    {
        $slug = trim($slug);
        if ($slug === '') {
            return 0;
        }
        $n = 0;
        foreach (self::$events as $id => $row) {
            if (($row['owner'] ?? '') === $slug) {
                unset(self::$events[$id]);
                $n++;
            }
        }
        return $n;
    }

    public static function has(string $id): bool
    {
        return isset(self::$events[trim($id)]);
    }

    /** @return array{id:string, owner:string, label:string, category:string, payload:array<string,mixed>}|null */
    public static function get(string $id): ?array
    {
        return self::$events[trim($id)] ?? null;
    }

    /**
     * @return list<array{id:string, owner:string, label:string, category:string, payload:array<string,mixed>}>
     */
    public static function list(): array
    {
        $out = array_values(self::$events);
        usort($out, static fn(array $a, array $b) => strcmp($a['id'], $b['id']));
        return $out;
    }

    /** Test helper. */
    public static function resetForTests(): void
    {
        self::$events = [];
    }
}
