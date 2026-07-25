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
use App\Router;
use App\Services\Modules\ModuleHealthService;
use App\Services\Modules\ModuleMigrationService;
use App\Services\Modules\ModuleRegistryRepository;

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

        $ctx = new PlatformContext(
            $slug,
            $sdkVer,
            $manifest,
            new DatabaseAdapter($this->db),
            new StorageAdapter($this->paths, $slug),
            new EventsAdapter($this->events, $this->db, $slug),
            $scheduler,
            new MailAdapter($this->db, $this->app),
            new NotificationsAdapter($this->db),
            new SettingsAdapter($this->db),
            new PermissionsAdapter($this->db),
            new UsersAdapter($this->db),
            new MediaAdapter($this->db),
            new BuilderAdapter($slug),
            new HttpAdapter($this->router, $prefix, $this->app, $this->db),
            new CacheAdapter(),
            new LoggerAdapter($slug),
            new ConfigAdapter($this->app),
            new TranslationsAdapter(),
            new AssetsAdapter($this->paths, $slug),
            new HealthAdapter($healthSvc),
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
    }
}
