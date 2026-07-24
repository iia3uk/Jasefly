<?php
declare(strict_types=1);

namespace App\Modules\Scheduler;

/**
 * Named job handlers registered by modules (automation.resume, newsletter.batch, …).
 */
final class JobHandlerRegistry
{
    /** @var array<string, callable(array): mixed> */
    private static array $handlers = [];

    public static function register(string $type, callable $handler): void
    {
        self::$handlers[$type] = $handler;
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

    /** @return list<string> */
    public static function types(): array
    {
        return array_keys(self::$handlers);
    }
}
