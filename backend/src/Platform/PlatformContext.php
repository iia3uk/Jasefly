<?php
declare(strict_types=1);

namespace App\Platform;

use App\Platform\Attributes\DeprecatedApi;
use App\Platform\Capabilities\CapabilityRegistry;
use App\Platform\Capabilities\ServiceRegistry;
use App\Platform\Contracts\PlatformAssetsInterface;
use App\Platform\Contracts\PlatformBuilderInterface;
use App\Platform\Contracts\PlatformCacheInterface;
use App\Platform\Contracts\PlatformCapabilitiesInterface;
use App\Platform\Contracts\PlatformConfigInterface;
use App\Platform\Contracts\PlatformContentInterface;
use App\Platform\Contracts\PlatformDatabaseInterface;
use App\Platform\Contracts\PlatformEventsInterface;
use App\Platform\Contracts\PlatformHealthInterface;
use App\Platform\Contracts\PlatformHttpInterface;
use App\Platform\Contracts\PlatformJobsInterface;
use App\Platform\Contracts\PlatformLoggerInterface;
use App\Platform\Contracts\PlatformMailInterface;
use App\Platform\Contracts\PlatformMediaInterface;
use App\Platform\Contracts\PlatformNotificationsInterface;
use App\Platform\Contracts\PlatformPermissionsInterface;
use App\Platform\Contracts\PlatformSchedulerInterface;
use App\Platform\Contracts\PlatformSettingsInterface;
use App\Platform\Contracts\PlatformStorageInterface;
use App\Platform\Contracts\PlatformTranslationsInterface;
use App\Platform\Contracts\PlatformUsersInterface;
use App\Platform\Manifest\FeatureFlags;
use App\Platform\Manifest\PlatformModuleManifestInterface;

/**
 * Official Platform SDK entry for package modules (SDK v2 surface).
 * SDK v1 modules receive the same object via CompatibilityLayer aliases.
 *
 * No method returns App\Core\* types.
 */
final class PlatformContext
{
    /** @var list<string> */
    private array $deprecatedHits = [];

    public function __construct(
        private string $moduleSlug,
        private int $moduleSdkVersion,
        private PlatformModuleManifestInterface $manifest,
        private PlatformDatabaseInterface $database,
        private PlatformStorageInterface $storage,
        private PlatformEventsInterface $events,
        private PlatformSchedulerInterface $scheduler,
        private PlatformMailInterface $mail,
        private PlatformNotificationsInterface $notifications,
        private PlatformSettingsInterface $settings,
        private PlatformPermissionsInterface $permissions,
        private PlatformUsersInterface $users,
        private PlatformMediaInterface $media,
        private PlatformBuilderInterface $builder,
        private PlatformHttpInterface $http,
        private PlatformCacheInterface $cache,
        private PlatformLoggerInterface $logger,
        private PlatformConfigInterface $config,
        private PlatformTranslationsInterface $translations,
        private PlatformAssetsInterface $assets,
        private PlatformHealthInterface $health,
        private PlatformContentInterface $content,
        private CapabilityRegistry $capabilities,
        private ServiceRegistry $services,
        private FeatureFlags $features,
    ) {}

    public function slug(): string
    {
        return $this->moduleSlug;
    }

    public function manifest(): PlatformModuleManifestInterface
    {
        return $this->manifest;
    }

    public function moduleSdkVersion(): int
    {
        return $this->moduleSdkVersion;
    }

    public function sdkVersion(): int
    {
        return SdkVersion::CURRENT;
    }

    public function database(): PlatformDatabaseInterface
    {
        return $this->database;
    }

    public function storage(): PlatformStorageInterface
    {
        return $this->storage;
    }

    public function events(): PlatformEventsInterface
    {
        return $this->events;
    }

    public function scheduler(): PlatformSchedulerInterface
    {
        return $this->scheduler;
    }

    /** SDK v2 preferred alias for scheduler(). */
    public function jobs(): PlatformJobsInterface
    {
        /** @var PlatformJobsInterface $jobs */
        $jobs = $this->scheduler;
        return $jobs;
    }

    public function mail(): PlatformMailInterface
    {
        return $this->mail;
    }

    public function notifications(): PlatformNotificationsInterface
    {
        return $this->notifications;
    }

    public function settings(): PlatformSettingsInterface
    {
        return $this->settings;
    }

    public function permissions(): PlatformPermissionsInterface
    {
        return $this->permissions;
    }

    public function users(): PlatformUsersInterface
    {
        return $this->users;
    }

    public function media(): PlatformMediaInterface
    {
        return $this->media;
    }

    public function builder(): PlatformBuilderInterface
    {
        return $this->builder;
    }

    public function http(): PlatformHttpInterface
    {
        return $this->http;
    }

    public function cache(): PlatformCacheInterface
    {
        return $this->cache;
    }

    public function logger(): PlatformLoggerInterface
    {
        return $this->logger;
    }

    public function config(): PlatformConfigInterface
    {
        return $this->config;
    }

    public function translations(): PlatformTranslationsInterface
    {
        return $this->translations;
    }

    public function assets(): PlatformAssetsInterface
    {
        return $this->assets;
    }

    public function health(): PlatformHealthInterface
    {
        return $this->health;
    }

    public function content(): PlatformContentInterface
    {
        return $this->content;
    }

    public function capabilities(): PlatformCapabilitiesInterface
    {
        return $this->capabilities;
    }

    public function feature(string $flag): bool
    {
        return $this->features->enabled($flag);
    }

    /**
     * Resolve a public platform service by catalog ID.
     * Unknown / internal IDs throw. Prefer typed accessors (mail(), database(), …).
     */
    public function service(string $id): object
    {
        return $this->services->require($id);
    }

    /**
     * @template T of object
     * @param class-string<T> $contractFqcn
     * @return T
     */
    public function serviceAs(string $id, string $contractFqcn): object
    {
        return $this->services->requireAs($id, $contractFqcn);
    }

    /**
     * SDK v1 alias kept for Compatibility Layer.
     * @deprecated Use database()
     */
    #[DeprecatedApi(since: 2, removeIn: 3, replacement: 'database()')]
    public function db(): PlatformDatabaseInterface
    {
        $this->deprecatedHits[] = 'db()';
        return $this->database();
    }

    /** @return list<string> */
    public function deprecatedApiHits(): array
    {
        return $this->deprecatedHits;
    }
}
