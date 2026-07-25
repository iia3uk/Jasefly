<?php
declare(strict_types=1);

namespace App\Platform\Package;

use App\Core\Modules\ModuleInstallContext;

/** Public install-hook contract for package modules. */
interface ModuleHookInterface
{
    public function run(ModuleInstallContext $context): void;
}
