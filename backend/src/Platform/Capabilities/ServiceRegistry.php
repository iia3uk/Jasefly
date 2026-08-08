<?php
declare(strict_types=1);

namespace App\Platform\Capabilities;

use App\Platform\Contracts\PlatformAssetsInterface;
use App\Platform\Contracts\PlatformBuilderInterface;
use App\Platform\Contracts\PlatformCacheInterface;
use App\Platform\Contracts\PlatformCatalogInterface;
use App\Platform\Contracts\PlatformCapabilitiesInterface;
use App\Platform\Contracts\PlatformConfigInterface;
use App\Platform\Contracts\PlatformContentInterface;
use App\Platform\Contracts\PlatformContentResourcesInterface;
use App\Platform\Contracts\PlatformDatabaseInterface;
use App\Platform\Contracts\PlatformEventsInterface;
use App\Platform\Contracts\PlatformHealthInterface;
use App\Platform\Contracts\PlatformHttpInterface;
use App\Platform\Contracts\PlatformLoggerInterface;
use App\Platform\Contracts\PlatformMailInterface;
use App\Platform\Contracts\PlatformMediaInterface;
use App\Platform\Contracts\PlatformNotificationsInterface;
use App\Platform\Contracts\PlatformOrdersInterface;
use App\Platform\Contracts\PlatformPermissionsInterface;
use App\Platform\Contracts\PlatformSchedulerInterface;
use App\Platform\Contracts\PlatformSettingsInterface;
use App\Platform\Contracts\PlatformStorageInterface;
use App\Platform\Contracts\PlatformTranslationsInterface;
use App\Platform\Contracts\PlatformUsersInterface;
use App\Platform\Manifest\FeatureFlags;
use App\Platform\SdkVersion;

/**
 * Typed public service discovery — only Platform Contracts may be registered/resolved.
 */
final class ServiceRegistry
{
    /** @var array<string, class-string> */
    public const PUBLIC_CATALOG = [
        'db' => PlatformDatabaseInterface::class,
        'database' => PlatformDatabaseInterface::class,
        'storage' => PlatformStorageInterface::class,
        'events' => PlatformEventsInterface::class,
        'scheduler' => PlatformSchedulerInterface::class,
        'mail' => PlatformMailInterface::class,
        'notifications' => PlatformNotificationsInterface::class,
        'catalog' => PlatformCatalogInterface::class,
        'orders' => PlatformOrdersInterface::class,
        'settings' => PlatformSettingsInterface::class,
        'permissions' => PlatformPermissionsInterface::class,
        'users' => PlatformUsersInterface::class,
        'media' => PlatformMediaInterface::class,
        'builder' => PlatformBuilderInterface::class,
        'http' => PlatformHttpInterface::class,
        'cache' => PlatformCacheInterface::class,
        'logger' => PlatformLoggerInterface::class,
        'config' => PlatformConfigInterface::class,
        'translations' => PlatformTranslationsInterface::class,
        'assets' => PlatformAssetsInterface::class,
        'health' => PlatformHealthInterface::class,
        'content' => PlatformContentInterface::class,
        'resources' => PlatformContentResourcesInterface::class,
        'capabilities' => PlatformCapabilitiesInterface::class,
        'features' => FeatureFlags::class,
        'access' => \App\Platform\Contracts\PlatformAccessInterface::class,
    ];

    /** @var array<string, object> */
    private array $services = [];

    /**
     * @param class-string|null $contract Expected contract; defaults to PUBLIC_CATALOG[$id]
     */
    public function set(string $id, object $service, ?string $contract = null): void
    {
        if (!isset(self::PUBLIC_CATALOG[$id]) && $contract === null) {
            throw new \InvalidArgumentException('Service ID is not a public Platform SDK service: ' . $id);
        }
        $expected = $contract ?? self::PUBLIC_CATALOG[$id];
        $this->assertPublicContract($expected);
        $this->assertNotInternal($service);
        if (!$service instanceof $expected) {
            throw new \InvalidArgumentException(
                "Service '{$id}' must implement {$expected}, got " . $service::class
            );
        }
        $this->services[$id] = $service;
    }

    public function get(string $id): ?object
    {
        if (!isset(self::PUBLIC_CATALOG[$id])) {
            return null;
        }
        return $this->services[$id] ?? null;
    }

    public function require(string $id): object
    {
        if (!isset(self::PUBLIC_CATALOG[$id])) {
            throw new \RuntimeException(
                'Unknown or internal platform service ID (not in Public API Registry): ' . $id
            );
        }
        $svc = $this->services[$id] ?? null;
        if ($svc === null) {
            throw new \RuntimeException('Platform service not registered: ' . $id);
        }
        $expected = self::PUBLIC_CATALOG[$id];
        if (!$svc instanceof $expected) {
            throw new \RuntimeException("Platform service '{$id}' failed contract check for {$expected}");
        }
        return $svc;
    }

    /**
     * @template T of object
     * @param class-string<T> $contractFqcn
     * @return T
     */
    public function requireAs(string $id, string $contractFqcn): object
    {
        $svc = $this->require($id);
        if (!$svc instanceof $contractFqcn) {
            throw new \RuntimeException(
                "Platform service '{$id}' is not an instance of {$contractFqcn}"
            );
        }
        return $svc;
    }

    /** @return list<string> */
    public function ids(): array
    {
        return array_keys($this->services);
    }

    /** @return array<string, array{contract:string, sdk_version:int, capability:?string}> */
    public static function catalog(): array
    {
        $capMap = [
            'mail' => 'mail.send',
            'notifications' => 'notifications.send',
            'catalog' => 'catalog.inventory',
            'orders' => 'orders.checkout',
            'media' => 'media.library',
            'scheduler' => 'scheduler.jobs',
            'storage' => 'storage.files',
            'events' => 'events.publish',
            'http' => 'http.client',
            'settings' => 'settings.module',
            'permissions' => 'permissions.check',
            'users' => 'users.current',
            'builder' => 'builder.widgets',
            'content' => 'content.pages',
            'resources' => 'content.resources',
            'db' => null,
            'database' => null,
            'cache' => null,
            'logger' => null,
            'config' => null,
            'translations' => null,
            'assets' => null,
            'health' => null,
            'capabilities' => null,
            'features' => null,
        ];
        $out = [];
        foreach (self::PUBLIC_CATALOG as $id => $contract) {
            $out[$id] = [
                'contract' => $contract,
                'sdk_version' => SdkVersion::CURRENT,
                'capability' => $capMap[$id] ?? null,
            ];
        }
        return $out;
    }

    private function assertPublicContract(string $contract): void
    {
        if ($contract === FeatureFlags::class) {
            return;
        }
        if (!str_starts_with($contract, 'App\\Platform\\Contracts\\')
            && !str_starts_with($contract, 'App\\Platform\\Manifest\\')) {
            throw new \InvalidArgumentException('Service contract must be a Platform public type: ' . $contract);
        }
    }

    private function assertNotInternal(object $service): void
    {
        $class = $service::class;
        foreach (['App\\Core\\', 'App\\Services\\', 'App\\Modules\\', 'App\\Controllers\\'] as $bad) {
            if (str_starts_with($class, $bad)) {
                throw new \InvalidArgumentException('Cannot register internal class as platform service: ' . $class);
            }
        }
    }
}
