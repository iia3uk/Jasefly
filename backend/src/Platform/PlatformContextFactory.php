<?php
declare(strict_types=1);

namespace App\Platform;

use App\Core\EventDispatcher;
use App\Core\Modules\ModuleManifest;
use App\Core\Modules\ModulePackagePaths;
use App\Database;
use App\Platform\Adapters\AssetsAdapter;
use App\Platform\Adapters\BuilderAdapter;
use App\Platform\Adapters\CacheAdapter;
use App\Platform\Adapters\ConfigAdapter;
use App\Platform\Adapters\ContentAdapter;
use App\Platform\Adapters\DatabaseAdapter;
use App\Platform\Adapters\EventsAdapter;
use App\Platform\Adapters\HealthAdapter;
use App\Platform\Adapters\HttpAdapter;
use App\Platform\Adapters\LoggerAdapter;
use App\Platform\Adapters\MailAdapter;
use App\Platform\Adapters\MediaAdapter;
use App\Platform\Adapters\NotificationsAdapter;
use App\Platform\Adapters\PermissionsAdapter;
use App\Platform\Adapters\SchedulerAdapter;
use App\Platform\Adapters\SettingsAdapter;
use App\Platform\Adapters\StorageAdapter;
use App\Platform\Adapters\TranslationsAdapter;
use App\Platform\Adapters\UsersAdapter;
use App\Platform\Capabilities\CapabilityRegistry;
use App\Platform\Capabilities\ServiceRegistry;
use App\Platform\Compatibility\CompatibilityLayer;
use App\Platform\Manifest\FeatureFlags;
use App\Platform\Manifest\PlatformModuleManifest;
use App\Router;
use App\Services\Modules\ModuleHealthService;
use App\Services\Modules\ModuleMigrationService;
use App\Services\Modules\ModuleRegistryRepository;

/** @internal Host factory — not for package import */
final class PlatformContextFactory
{
    private CapabilityRegistry $capabilities;
    private ServiceRegistry $services;
    private FeatureFlags $features;

    public function __construct(
        private Database $db,
        private array $app,
        private ModulePackagePaths $paths,
        private EventDispatcher $events,
        private ?Router $router = null,
        private ?string $apiPrefix = null,
    ) {
        $this->capabilities = new CapabilityRegistry($db);
        $this->services = new ServiceRegistry();
        $this->features = new FeatureFlags(is_array($app['platform_features'] ?? null) ? $app['platform_features'] : []);
        $this->wireCoreServices();
    }

    public function capabilities(): CapabilityRegistry
    {
        return $this->capabilities;
    }

    public function withRouter(Router $router, string $apiPrefix): self
    {
        $clone = clone $this;
        $clone->router = $router;
        $clone->apiPrefix = $apiPrefix;
        return $clone;
    }

    public function create(string $slug, ModuleManifest $manifest): PlatformContext
    {
        $sdkVer = $manifest->sdkVersion();
        if ($this->router === null) {
            throw new \RuntimeException('PlatformContext requires Router — call withRouter() before create()');
        }
        $prefix = $this->apiPrefix ?? '/api/v1';
        $scheduler = new SchedulerAdapter($this->db, $slug);
        $healthSvc = new ModuleHealthService(
            new ModuleRegistryRepository($this->db),
            $this->paths,
            new ModuleMigrationService($this->db),
            $this->app,
        );
        $publicManifest = PlatformModuleManifest::fromCore($manifest);

        $dbAdapter = new DatabaseAdapter($this->db);
        $settings = new SettingsAdapter($this->db, $slug);
        $cache = new CacheAdapter($slug);
        $health = new HealthAdapter($healthSvc, $slug);

        // Per-module scoped services override shared defaults
        $this->services->set('db', $dbAdapter);
        $this->services->set('database', $dbAdapter);
        $this->services->set('settings', $settings);
        $this->services->set('cache', $cache);
        $this->services->set('health', $health);
        $this->services->set('storage', new StorageAdapter($this->paths, $slug));
        $this->services->set('events', new EventsAdapter($this->events, $this->db, $slug));
        $this->services->set('scheduler', $scheduler);
        $this->services->set('http', new HttpAdapter($this->router, $prefix, $this->app, $this->db));
        $this->services->set('builder', new BuilderAdapter($slug));
        $this->services->set('logger', new LoggerAdapter($slug));
        $this->services->set('assets', new AssetsAdapter($this->paths, $slug));

        $ctx = new PlatformContext(
            $slug,
            $sdkVer,
            $publicManifest,
            $dbAdapter,
            new StorageAdapter($this->paths, $slug),
            new EventsAdapter($this->events, $this->db, $slug),
            $scheduler,
            new MailAdapter($this->db, $this->app),
            new NotificationsAdapter($this->db),
            $settings,
            new PermissionsAdapter($this->db),
            new UsersAdapter($this->db),
            new MediaAdapter($this->db),
            new BuilderAdapter($slug),
            new HttpAdapter($this->router, $prefix, $this->app, $this->db),
            $cache,
            new LoggerAdapter($slug),
            new ConfigAdapter($this->app),
            new TranslationsAdapter(),
            new AssetsAdapter($this->paths, $slug),
            $health,
            new ContentAdapter($this->db),
            $this->capabilities,
            $this->services,
            $this->features,
        );

        return CompatibilityLayer::wrap($ctx, $sdkVer);
    }

    private function wireCoreServices(): void
    {
        $this->services->set('capabilities', $this->capabilities);
        $this->services->set('features', $this->features);
        $this->services->set('db', new DatabaseAdapter($this->db));
        $this->services->set('database', new DatabaseAdapter($this->db));
        $this->services->set('settings', new SettingsAdapter($this->db));
        $this->services->set('mail', new MailAdapter($this->db, $this->app));
        $this->services->set('notifications', new NotificationsAdapter($this->db));
        $this->services->set('media', new MediaAdapter($this->db));
        $this->services->set('content', new ContentAdapter($this->db));
        $this->services->set('permissions', new PermissionsAdapter($this->db));
        $this->services->set('users', new UsersAdapter($this->db));
        $this->services->set('cache', new CacheAdapter());
        $this->services->set('config', new ConfigAdapter($this->app));
        $this->services->set('translations', new TranslationsAdapter());
        $this->services->set('health', new HealthAdapter());
    }
}
