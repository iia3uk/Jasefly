<?php
declare(strict_types=1);

namespace App\Core\Modules;

use App\Core\EventDispatcher;
use App\Core\ModuleRegistry;
use App\Database;
use App\Router;

/**
 * Safe runtime context for package modules (register/boot).
 */
final class ModuleContext
{
    public function __construct(
        public readonly Database $db,
        public readonly array $app,
        public readonly Router $router,
        public readonly string $apiPrefix,
        public readonly EventDispatcher $events,
        public readonly ModuleRegistry $registry,
        public readonly ModuleManifest $manifest,
        public readonly string $moduleRoot,
        public readonly string $storageRoot,
    ) {}
}
