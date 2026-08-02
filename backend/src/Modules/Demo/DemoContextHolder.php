<?php
declare(strict_types=1);

namespace App\Modules\Demo;

final class DemoContextHolder
{
    private static ?DemoContext $ctx = null;

    public static function set(DemoContext $ctx): void
    {
        self::$ctx = $ctx;
    }

    public static function clear(): void
    {
        self::$ctx = null;
    }

    public static function get(): ?DemoContext
    {
        return self::$ctx;
    }

    public static function isDemo(): bool
    {
        return self::$ctx !== null && self::$ctx->isDemo;
    }

    public static function require(): DemoContext
    {
        if (self::$ctx === null) {
            throw new \RuntimeException('DemoContext missing');
        }
        return self::$ctx;
    }
}
