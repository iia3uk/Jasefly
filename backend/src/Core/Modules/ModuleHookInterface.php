<?php
declare(strict_types=1);

namespace App\Core\Modules;

interface ModuleHookInterface
{
    public function run(ModuleInstallContext $context): void;
}
