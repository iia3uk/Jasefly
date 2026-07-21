<?php
declare(strict_types=1);

namespace App\Modules\Template;

use App\Core\AbstractModule;
use App\Database;
use App\Router;

/**
 * Scaffold for future packages (Games, Courses, Marketplace, Docs…).
 * Copy to Modules/Games/GamesModule.php and set enabled() true.
 */
final class TemplateModule extends AbstractModule
{
    public function name(): string
    {
        return 'template';
    }

    public function enabled(array $app): bool
    {
        return false;
    }

    public function registerRoutes(Router $router, Database $db, array $app, string $apiPrefix): void
    {
    }
}
