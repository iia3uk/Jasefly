<?php
declare(strict_types=1);

namespace App\Core\Modules;

use App\Core\AbstractModule;
use App\Core\Container;
use App\Core\EventDispatcher;
use App\Database;
use App\Platform\Capabilities\CapabilityRegistry;
use App\Platform\PlatformContextFactory;
use App\Router;

/**
 * Wraps a package entrypoint class into ModuleInterface for ModuleRegistry.
 */
final class PackageModuleAdapter extends AbstractModule
{
    private bool $platformBooted = false;

    public function __construct(
        private InstallableModuleInterface $inner,
        private ModuleManifest $packageManifest,
    ) {}

    public function name(): string
    {
        return $this->inner->name() !== '' ? $this->inner->name() : $this->packageManifest->slug();
    }

    public function label(): string
    {
        return $this->inner->label() !== '' ? $this->inner->label() : $this->packageManifest->name();
    }

    public function description(): string
    {
        $d = $this->inner->description();
        return $d !== '' ? $d : $this->packageManifest->description();
    }

    public function priority(): int
    {
        return $this->inner->priority();
    }

    public function registersRoutesWhenDisabled(): bool
    {
        return $this->inner->registersRoutesWhenDisabled();
    }

    public function requires(): array
    {
        return array_keys($this->packageManifest->requiredDependencies());
    }

    public function suggests(): array
    {
        return array_keys($this->packageManifest->optionalDependencies());
    }

    public function boot(Database $db, array $app): void
    {
        $this->inner->boot($db, $app);
    }

    public function registerRoutes(Router $router, Database $db, array $app, string $apiPrefix): void
    {
        $this->bootPlatformOnce($router, $db, $app, $apiPrefix);
        $this->inner->registerRoutes($router, $db, $app, $apiPrefix);
    }

    private function bootPlatformOnce(Router $router, Database $db, array $app, string $apiPrefix): void
    {
        if ($this->platformBooted) {
            return;
        }
        $this->platformBooted = true;
        try {
            $paths = ModulePackagePaths::fromApp($app);
            $c = Container::getInstance();
            $events = $c->has(EventDispatcher::class) ? $c->get(EventDispatcher::class) : null;
            if (!$events instanceof EventDispatcher) {
                $events = new EventDispatcher();
            }
            $factory = new PlatformContextFactory($db, $app, $paths, $events);
            $ctx = $factory->withRouter($router, $apiPrefix)->create(
                $this->packageManifest->slug(),
                $this->packageManifest,
            );
            foreach ($this->packageManifest->providedCapabilities() as $cap) {
                $factory->capabilities()->register(
                    $cap,
                    'module.' . $this->packageManifest->slug(),
                    $this->packageManifest->slug(),
                    80,
                );
            }
            $surfaces = $this->packageManifest->surfaces();
            if ($surfaces !== []) {
                $ctx->surfaces()->register($surfaces);
            }
            $this->inner->bootPlatform($ctx);
        } catch (\Throwable $e) {
            @error_log('PackageModuleAdapter bootPlatform ' . $this->packageManifest->slug() . ': ' . $e->getMessage());
            throw $e;
        }
    }

    public function adminNav(): array
    {
        return $this->inner->adminNav();
    }

    public function resources(): array
    {
        return $this->inner->resources();
    }

    public function blueprints(): array
    {
        return $this->inner->blueprints();
    }

    public function hooks(): array
    {
        return $this->inner->hooks();
    }

    public function blocks(): array
    {
        return $this->inner->blocks();
    }

    public function publicRoutes(): array
    {
        return $this->inner->publicRoutes();
    }

    public function settingsSchema(): array
    {
        return $this->inner->settingsSchema();
    }

    public function settings(): array
    {
        return $this->inner->settings();
    }

    public function demoPages(): array
    {
        return $this->inner->demoPages();
    }

    public function globalMiddleware(Database $db, array $app): array
    {
        return $this->inner->globalMiddleware($db, $app);
    }

    public function packageManifest(): ModuleManifest
    {
        return $this->packageManifest;
    }

    public function inner(): InstallableModuleInterface
    {
        return $this->inner;
    }
}
