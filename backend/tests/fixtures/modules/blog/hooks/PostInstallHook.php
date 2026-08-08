<?php
declare(strict_types=1);

namespace App\PackageModules\Blog\Hooks;

use App\Platform\Package\ModuleHookInterface;
use App\Platform\Package\PlatformInstallContextInterface;

final class PostInstallHook implements ModuleHookInterface
{
    public function run(PlatformInstallContextInterface $context): void
    {
        $context->log('Blog package installed');
    }
}
