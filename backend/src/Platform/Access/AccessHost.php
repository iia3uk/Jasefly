<?php
declare(strict_types=1);

namespace App\Platform\Access;

use App\Database;

/**
 * Process-wide AccessService singleton for controllers and PlatformContextFactory.
 */
final class AccessHost
{
    private static ?AccessService $instance = null;

    public static function boot(Database $db): AccessService
    {
        if (self::$instance instanceof AccessService) {
            return self::$instance;
        }
        $registry = new AccessProviderRegistry();
        $service = new AccessService($registry, $db);
        $service->registerBuiltins();
        self::$instance = $service;
        return $service;
    }

    public static function get(): AccessService
    {
        if (!(self::$instance instanceof AccessService)) {
            throw new \RuntimeException('AccessHost not booted — call AccessHost::boot($db) during Bootstrap');
        }
        return self::$instance;
    }

    public static function tryGet(): ?AccessService
    {
        return self::$instance;
    }
}
