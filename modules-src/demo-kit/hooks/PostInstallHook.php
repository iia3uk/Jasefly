<?php
declare(strict_types=1);

namespace App\PackageModules\DemoKit\Hooks;

use App\Core\Modules\ModuleHookInterface;
use App\Core\Modules\ModuleInstallContext;

final class PostInstallHook implements ModuleHookInterface
{
    public function run(ModuleInstallContext $context): void
    {
        $storage = rtrim($context->storageRoot, '/\\') . '/post_install.marker';
        @file_put_contents($storage, gmdate(DATE_ATOM) . ' demo-kit after_install' . PHP_EOL, FILE_APPEND);
        $context->log('PostInstallHook executed');
    }
}
