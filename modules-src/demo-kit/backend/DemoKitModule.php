<?php
declare(strict_types=1);

namespace App\PackageModules\DemoKit;

use App\Core\Modules\AbstractPackageModule;
use App\Core\Modules\ModuleContext;
use App\Database;
use App\Middleware\AuthMiddleware;
use App\Middleware\PermissionMiddleware;
use App\Request;
use App\Response;
use App\Router;
use App\Services\PermissionService;

final class DemoKitModule extends AbstractPackageModule
{
    public function name(): string
    {
        return 'demo-kit';
    }

    public function label(): string
    {
        return 'Demo Kit';
    }

    public function priority(): int
    {
        return 200;
    }

    public function adminNav(): array
    {
        return [
            [
                'group' => 'Разработка',
                'path' => '/admin/demo-kit',
                'label' => 'Demo Kit',
                'permission' => 'demo-kit.view',
                'icon' => 'package',
            ],
        ];
    }

    public function register(ModuleContext $context): void
    {
        // Routes registered via registerRoutes during HTTP boot.
    }

    public function registerRoutes(Router $router, Database $db, array $app, string $apiPrefix): void
    {
        $p = fn(string $path) => rtrim($apiPrefix, '/') . $path;
        $perms = new PermissionService($db);
        $protected = [new AuthMiddleware($app['jwt_secret']), new PermissionMiddleware($perms)];

        $router->get($p('/admin/demo-kit/ping'), function (Request $r) use ($perms) {
            $perms->require($r->user ?? [], 'demo-kit.view');
            Response::json(['data' => [
                'ok' => true,
                'module' => 'demo-kit',
                'message' => 'pong',
                'time' => gmdate(DATE_ATOM),
            ]]);
        }, $protected);
    }
}
