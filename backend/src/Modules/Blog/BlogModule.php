<?php
declare(strict_types=1);

namespace App\Modules\Blog;

use App\Controllers\AdminController;
use App\Controllers\PublicController;
use App\Core\AbstractModule;
use App\Database;
use App\Middleware\AuthMiddleware;
use App\Middleware\PermissionMiddleware;
use App\Request;
use App\Router;
use App\Services\PermissionService;

final class BlogModule extends AbstractModule
{
    public function name(): string
    {
        return 'blog';
    }

    public function label(): string
    {
        return 'Blog';
    }

    public function priority(): int
    {
        return 40;
    }

    public function registerRoutes(Router $router, Database $db, array $app, string $apiPrefix): void
    {
        $p = fn(string $path) => rtrim($apiPrefix, '/') . $path;
        $public = new PublicController($db, $app);
        $admin = new AdminController($db, $app);
        $protected = [new AuthMiddleware($app['jwt_secret']), new PermissionMiddleware(new PermissionService($db))];

        $router->get($p('/blog'), [$public, 'blog']);
        $router->get($p('/blog/{slug}'), [$public, 'blog']);

        $base = $p('/admin/blog');
        $router->get($base, fn(Request $r) => $admin->index($r, 'blog'), $protected);
        $router->post($base, fn(Request $r) => $admin->create($r, 'blog'), $protected);
        $router->get("$base/{id}", fn(Request $r, $id) => $admin->show($r, 'blog', $id), $protected);
        $router->put("$base/{id}", fn(Request $r, $id) => $admin->update($r, 'blog', $id), $protected);
        $router->delete("$base/{id}", fn(Request $r, $id) => $admin->delete($r, 'blog', $id), $protected);
        $router->post("$base/{id}/publish", fn(Request $r, $id) => $admin->publish($r, 'blog', $id), $protected);
    }

    public function adminNav(): array
    {
        return [
            ['group' => 'Content', 'path' => '/admin/blog', 'label' => 'Blog'],
        ];
    }

    public function resources(): array
    {
        return [
            ['key' => 'blog', 'table' => 'blog_posts', 'soft_delete' => true, 'sluggable' => true],
        ];
    }

    public function demoPages(): array
    {
        return [
            [
                'slug' => 'blog',
                'title' => 'Блог',
                'status' => 'published',
                'template' => 'default',
                'seo_title' => 'Блог',
                'seo_description' => 'Статьи, новости и заметки.',
                'content' => '<h1>Блог</h1><p>Здесь будут ваши статьи. Эта страница создана плагином Blog — добавьте сетку постов в билдере или используйте виджет «Сетка блога».</p>',
            ],
        ];
    }
}
