<?php
declare(strict_types=1);

namespace App\Core\Modules;

use App\Core\AbstractModule;
use App\Database;
use App\Router;

/**
 * Base class for installable package modules (App\PackageModules\*).
 */
abstract class AbstractPackageModule extends AbstractModule implements InstallableModuleInterface
{
    protected ?ModuleManifest $packageManifest = null;

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
        // default: routes via registerRoutes
    }

    public function bootWithContext(ModuleContext $context): void
    {
        $this->boot($context->db, $context->app);
    }

    public function registerRoutes(Router $router, Database $db, array $app, string $apiPrefix): void
    {
        // override in package
    }
}
