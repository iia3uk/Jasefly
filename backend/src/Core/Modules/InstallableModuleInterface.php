<?php
declare(strict_types=1);

namespace App\Core\Modules;

use App\Core\Contract\ModuleInterface;

/**
 * Package modules implement ModuleInterface plus explicit register/boot with ModuleContext.
 */
interface InstallableModuleInterface extends ModuleInterface
{
    public function manifest(): ModuleManifest;

    public function register(ModuleContext $context): void;

    public function bootWithContext(ModuleContext $context): void;
}
