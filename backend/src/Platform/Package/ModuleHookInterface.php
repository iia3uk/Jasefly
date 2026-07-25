<?php
declare(strict_types=1);

namespace App\Platform\Package;

/** Public install-hook contract for package modules. */
interface ModuleHookInterface
{
    public function run(PlatformInstallContextInterface $context): void;
}
