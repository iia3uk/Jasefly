<?php
declare(strict_types=1);

namespace App\PackageModules\JaseflyCharacter\Hooks;

use App\Platform\Package\ModuleHookInterface;
use App\Platform\Package\PlatformInstallContextInterface;

final class PostInstallHook implements ModuleHookInterface
{
    public function run(PlatformInstallContextInterface $context): void
    {
        $marker = $context->storagePath('post_install.marker');
        @file_put_contents(
            $marker,
            gmdate(DATE_ATOM) . ' jasefly-character after_install v' . $context->version() . PHP_EOL,
            FILE_APPEND
        );
        $context->log('Jasefly Character PostInstallHook executed');
    }
}
