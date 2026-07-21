<?php
declare(strict_types=1);

namespace App\Modules\Users;

use App\Core\AbstractModule;
use App\Controllers\UserController;
use App\Database;
use App\Middleware\AuthMiddleware;
use App\Middleware\PermissionMiddleware;
use App\Request;
use App\Response;
use App\Router;
use App\Services\PermissionService;

/**
 * Users & Roles plugin — multi-user management with policy-based permissions.
 *
 * Endpoints:
 *   GET    /admin/users            list users (admin+)
 *   POST   /admin/users             create user (admin+)
 *   GET    /admin/users/{id}        show user
 *   PUT    /admin/users/{id}        update user (name/role/password)
 *   DELETE /admin/users/{id}        delete user
 *   GET    /admin/roles             list roles
 *   GET    /admin/permissions       list permissions
 *   GET    /admin/roles/{id}/permissions   role permissions
 *   PUT    /admin/roles/{id}/permissions   update role permissions (super_admin)
 */
final class UsersModule extends AbstractModule
{
    public function name(): string
    {
        return 'users';
    }

    public function label(): string
    {
        return 'Users & Roles';
    }

    public function priority(): int
    {
        return 15;
    }

    public function registerRoutes(Router $router, Database $db, array $app, string $apiPrefix): void
    {
        $p = fn(string $path) => rtrim($apiPrefix, '/') . $path;
        $ctrl = new UserController($db, $app);
        $protected = [new AuthMiddleware($app['jwt_secret']), new PermissionMiddleware(new PermissionService($db))];

        $router->get($p('/admin/users'), [$ctrl, 'index'], $protected);
        $router->post($p('/admin/users'), [$ctrl, 'create'], $protected);
        $router->get($p('/admin/users/{id}'), fn(Request $r, $id) => $ctrl->show($r, $id), $protected);
        $router->put($p('/admin/users/{id}'), fn(Request $r, $id) => $ctrl->update($r, $id), $protected);
        $router->delete($p('/admin/users/{id}'), fn(Request $r, $id) => $ctrl->delete($r, $id), $protected);

        $router->get($p('/admin/roles'), [$ctrl, 'rolesIndex'], $protected);
        $router->get($p('/admin/permissions'), [$ctrl, 'permissionsIndex'], $protected);
        $router->get($p('/admin/roles/{id}/permissions'), fn(Request $r, $id) => $ctrl->rolePermissions($r, $id), $protected);
        $router->put($p('/admin/roles/{id}/permissions'), fn(Request $r, $id) => $ctrl->updateRolePermissions($r, $id), $protected);
    }

    public function adminNav(): array
    {
        return [
            ['group' => 'Система', 'path' => '/admin/users', 'label' => 'Пользователи', 'permission' => 'users.manage', 'icon' => 'users'],
            ['group' => 'Система', 'path' => '/admin/roles', 'label' => 'Роли и права', 'permission' => 'users.manage', 'icon' => 'key'],
        ];
    }

    public function blueprints(): array
    {
        return [
            [
                'key' => 'users',
                'table' => 'users',
                'label' => 'Пользователи',
                'group' => 'Система',
                'icon' => 'users',
                'columns' => [
                    'email' => ['type' => 'string', 'widget' => 'text', 'required' => true, 'label' => 'Email'],
                    'name' => ['type' => 'string', 'widget' => 'text', 'required' => true, 'label' => 'Имя'],
                    'role' => ['type' => 'string', 'widget' => 'select', 'default' => 'editor', 'label' => 'Роль',
                        'options' => [
                            ['value' => 'admin', 'label' => 'Admin'],
                            ['value' => 'editor', 'label' => 'Editor'],
                        ]],
                ],
                'permissions' => ['users.manage'],
            ],
        ];
    }
}
