<?php
declare(strict_types=1);

namespace App\PackageModules\SdkSchedulerProbe\Hooks;

use App\Platform\Package\ModuleHookInterface;
use App\Platform\Package\PlatformInstallContextInterface;

final class PostInstallHook implements ModuleHookInterface
{
    public function run(PlatformInstallContextInterface $context): void
    {
        $storage = $context->storagePath('post_install.marker');
        @file_put_contents(
            $storage,
            gmdate(DATE_ATOM) . ' sdk-scheduler-probe after_install' . PHP_EOL,
            FILE_APPEND
        );
        $context->log('PostInstallHook executed');
    }
}
