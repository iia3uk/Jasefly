<?php
declare(strict_types=1);

namespace App\PackageModules\FormsSdkReference\Hooks;

use App\Platform\Package\ModuleHookInterface;
use App\Platform\Package\PlatformInstallContextInterface;

final class PostUpdateHook implements ModuleHookInterface
{
    public function run(PlatformInstallContextInterface $context): void
    {
        $marker = $context->storagePath('post_update.marker');
        @file_put_contents(
            $marker,
            gmdate(DATE_ATOM) . ' forms-sdk-reference after_update v' . $context->version() . PHP_EOL,
            FILE_APPEND
        );
        $context->log('PostUpdateHook executed for v' . $context->version());
    }
}
