<?php
declare(strict_types=1);

namespace App;

use App\Core\Container;
use App\Core\ModuleRegistry;

final class Bootstrap
{
    private static bool $autoloadRegistered = false;

    /** Register App\* autoload without DB (CLI validate-sdk / tests). */
    public static function registerAutoload(): void
    {
        if (self::$autoloadRegistered) {
            return;
        }
        self::$autoloadRegistered = true;
        $apiRoot = dirname(__DIR__);
        spl_autoload_register(static function (string $class) use ($apiRoot): void {
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
            // App\PackageModules\{Slug}\Foo → api/modules/{slug}/backend/Foo.php
            if (str_starts_with($relative, 'PackageModules/')) {
                $rest = substr($relative, strlen('PackageModules/'));
                $parts = explode('/', $rest, 2);
                $studly = $parts[0] ?? '';
                $tail = $parts[1] ?? '';
                if ($studly !== '' && $tail !== '') {
                    $slug = strtolower(preg_replace('/([a-z])([A-Z])/', '$1-$2', $studly) ?? $studly);
                    $candidates[] = $apiRoot . '/modules/' . $slug . '/backend/' . $tail . '.php';
                }
            }
            foreach ($candidates as $file) {
                if (is_file($file)) {
                    // Jail: PackageModules files must stay under api/modules/
                    if (str_contains($file, '/modules/')) {
                        $modulesRoot = realpath($apiRoot . '/modules');
                        $real = realpath($file);
                        if ($modulesRoot === false || $real === false || !str_starts_with(str_replace('\\', '/', $real), str_replace('\\', '/', $modulesRoot) . '/')) {
                            continue;
                        }
                    }
                    require $file;
                    return;
                }
            }
        });
    }

    public static function init(): array
    {
        self::registerAutoload();

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
        $registry->discover();

        // Installable ZIP packages (api/modules/{slug}) — skip failed/safe-mode.
        try {
            $paths = \App\Core\Modules\ModulePackagePaths::fromApp($app);
            $repo = new \App\Services\Modules\ModuleRegistryRepository($db);
            $safe = new \App\Services\Modules\ModuleSafeMode($paths);
            $loader = new \App\Services\Modules\InstalledModuleLoader($repo, $paths, $safe, $db, $app);
            $loader->loadEnabled($registry);
        } catch (\Throwable $e) {
            @error_log('InstalledModuleLoader: ' . $e->getMessage());
        }

        $registry->boot();
        $container->set(ModuleRegistry::class, $registry);

        return [$app, $db, $registry];
    }
}
