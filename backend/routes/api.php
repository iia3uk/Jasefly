<?php
/**
 * Legacy routes entry — modules now register themselves via ModuleRegistry.
 * Kept so older docs that `require routes/api.php` still boot cleanly.
 */
/** @var \App\Router $router @var \App\Database $db @var array $app */

use App\Core\Container;
use App\Core\ModuleRegistry;

$registry = Container::getInstance()->has(ModuleRegistry::class)
    ? Container::getInstance()->get(ModuleRegistry::class)
    : (new ModuleRegistry($db, $app, dirname(__DIR__) . '/src/Modules'))->discover()->boot();

$registry->registerRoutes($router, '/api/v1');
$registry->registerRoutes($router, '/api');
