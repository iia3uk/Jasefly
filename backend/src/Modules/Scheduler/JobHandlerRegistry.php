<?php
declare(strict_types=1);

namespace App\Modules\Scheduler;

/**
 * Named job handlers. Package handlers are owned by module slug and namespaced
 * as `{slug}.{localType}` via Platform SchedulerAdapter.
 */
final class JobHandlerRegistry
{
    /** @var array<string, callable(array): mixed> */
    private static array $handlers = [];

    /** @var array<string, string> type → owning module slug */
    private static array $owners = [];

    public static function register(string $type, callable $handler, ?string $owner = null): void
    {
        $type = trim($type);
        if ($type === '') {
            throw new \InvalidArgumentException('Job type must not be empty');
        }
        self::$handlers[$type] = $handler;
        if ($owner !== null && $owner !== '') {
            self::$owners[$type] = $owner;
        } elseif (!isset(self::$owners[$type]) && str_contains($type, '.')) {
            self::$owners[$type] = explode('.', $type, 2)[0];
        }
    }

    public static function unregister(string $type): void
    {
        unset(self::$handlers[$type], self::$owners[$type]);
    }

    /** @return int number of handlers removed */
    public static function unregisterByOwner(string $ownerSlug): int
    {
        $ownerSlug = trim($ownerSlug);
        if ($ownerSlug === '') {
            return 0;
        }
        $n = 0;
        foreach (array_keys(self::$owners) as $type) {
            if ((self::$owners[$type] ?? '') === $ownerSlug) {
                unset(self::$handlers[$type], self::$owners[$type]);
                $n++;
            }
        }
        // Also drop any namespaced types for this slug even if owner map drifted
        foreach (array_keys(self::$handlers) as $type) {
            if (str_starts_with($type, $ownerSlug . '.')) {
                unset(self::$handlers[$type], self::$owners[$type]);
                $n++;
            }
        }
        return $n;
    }

    public static function has(string $type): bool
    {
        return isset(self::$handlers[$type]);
    }

    /** @return callable(array): mixed|null */
    public static function get(string $type): ?callable
    {
        return self::$handlers[$type] ?? null;
    }

    public static function ownerOf(string $type): ?string
    {
        if (isset(self::$owners[$type])) {
            return self::$owners[$type];
        }
        if (str_contains($type, '.')) {
            return explode('.', $type, 2)[0];
        }
        return null;
    }

    /** @return list<string> */
    public static function types(): array
    {
        return array_keys(self::$handlers);
    }

    /**
     * @return list<array{type:string, owner:?string}>
     */
    public static function catalog(): array
    {
        $out = [];
        foreach (self::$handlers as $type => $_) {
            $out[] = [
                'type' => $type,
                'owner' => self::ownerOf($type),
            ];
        }
        usort($out, static fn($a, $b) => strcmp($a['type'], $b['type']));
        return $out;
    }

    /** Test helper — clear process-global registry. */
    public static function resetForTests(): void
    {
        self::$handlers = [];
        self::$owners = [];
    }
}
