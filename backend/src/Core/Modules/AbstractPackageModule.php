<?php
declare(strict_types=1);

namespace App\Core\Modules;

use App\Core\AbstractModule;
use App\Database;
use App\Platform\PlatformContext;
use App\Router;

/**
 * Base class for installable package modules (App\PackageModules\*).
 * Prefer bootPlatform(PlatformContext) — do not import App\Core or App\Modules services.
 */
abstract class AbstractPackageModule extends AbstractModule implements InstallableModuleInterface
{
    protected ?ModuleManifest $packageManifest = null;
    protected ?PlatformContext $platform = null;

    public function setPackageManifest(ModuleManifest $manifest): void
    {
        $this->packageManifest = $manifest;
    }

    public function manifest(): ModuleManifest
    {
        if ($this->packageManifest === null) {
            throw new \RuntimeException('Package manifest not attached');
        }
        return $this->packageManifest;
    }

    public function register(ModuleContext $context): void
    {
        // legacy — prefer bootPlatform
    }

    public function bootWithContext(ModuleContext $context): void
    {
        $this->boot($context->db, $context->app);
    }

    public function bootPlatform(PlatformContext $ctx): void
    {
        $this->platform = $ctx;
    }

    protected function platform(): PlatformContext
    {
        if ($this->platform === null) {
            throw new \RuntimeException('PlatformContext not available — wait for bootPlatform()');
        }
        return $this->platform;
    }

    public function registerRoutes(Router $router, Database $db, array $app, string $apiPrefix): void
    {
        // Prefer registering routes inside bootPlatform via $ctx->http()
    }
}
