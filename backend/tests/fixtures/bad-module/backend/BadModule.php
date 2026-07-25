<?php
declare(strict_types=1);

namespace App\PackageModules\BadModule;

use App\Core\EventDispatcher;

/** Fixture: forbidden Core import — must fail validate-sdk */
final class BadModule
{
    public function boot(): void
    {
        new EventDispatcher();
    }
}
