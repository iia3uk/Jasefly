<?php
declare(strict_types=1);

namespace App\Core\Modules;

use App\Core\Contract\ModuleInterface;
use App\Platform\PlatformContext;

/**
 * Package modules implement ModuleInterface plus Platform SDK boot.
 */
interface InstallableModuleInterface extends ModuleInterface
{
    public function manifest(): ModuleManifest;

    public function register(ModuleContext $context): void;

    public function bootWithContext(ModuleContext $context): void;

    /** Official Platform SDK entry (preferred over registerRoutes side-effects). */
    public function bootPlatform(PlatformContext $ctx): void;
}
