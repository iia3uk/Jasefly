<?php
declare(strict_types=1);

namespace App;

use App\Core\Container;
use App\Core\ModuleRegistry;

final class Bootstrap
{
    public static function init(): array
    {
        spl_autoload_register(static function (string $class): void {
            if (!str_starts_with($class, 'App\\')) {
                return;
            }
            $relative = str_replace('\\', '/', substr($class, 4));
            $candidates = [
                __DIR__ . '/' . $relative . '.php',
                // Modules live under Modules/{Name}/...
                __DIR__ . '/Modules/' . $relative . '.php',
            ];
            // App\Modules\Projects\ProjectsModule → Modules/Projects/ProjectsModule.php
            if (str_starts_with($relative, 'Modules/')) {
                $candidates[] = __DIR__ . '/' . $relative . '.php';
            }
            foreach ($candidates as $file) {
                if (is_file($file)) {
                    require $file;
                    return;
                }
            }
        });

        // Secrets from config/.env (blocked from HTTP). Does not override real OS env.
        require_once __DIR__ . '/Support/EnvFile.php';
        \App\Support\EnvFile::load(dirname(__DIR__) . '/config/.env');

        $app = require dirname(__DIR__) . '/config/app.php';
        $dbConfig = require dirname(__DIR__) . '/config/database.php';
        date_default_timezone_set($app['timezone'] ?? 'UTC');
        error_reporting(E_ALL);
        ini_set('display_errors', '0');

        $db = Database::get($dbConfig);

        $container = Container::getInstance();
        $container->set('app', $app);
        $container->set('db', $db);

        $registry = new ModuleRegistry($db, $app, __DIR__ . '/Modules');
        // EventDispatcher must be resolvable from the container DURING boot()
        // (integration plugins subscribe to events in their boot() method), so
        // register it before discover()->boot() runs.
        $container->set(\App\Core\EventDispatcher::class, $registry->events());
        $registry->discover()->boot();
        $container->set(ModuleRegistry::class, $registry);

        return [$app, $db, $registry];
    }
}
