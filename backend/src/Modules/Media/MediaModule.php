<?php
declare(strict_types=1);

namespace App\Modules\Media;

use App\Controllers\MediaController;
use App\Core\AbstractModule;
use App\Database;
use App\Middleware\AuthMiddleware;
use App\Middleware\PermissionMiddleware;
use App\Router;
use App\Services\PermissionService;

final class MediaModule extends AbstractModule
{
    public function name(): string
    {
        return 'media';
    }

    public function label(): string
    {
        return 'Media Library';
    }

    public function priority(): int
    {
        return 25;
    }

    public function registerRoutes(Router $router, Database $db, array $app, string $apiPrefix): void
    {
        $p = fn(string $path) => rtrim($apiPrefix, '/') . $path;
        $media = new MediaController($db, $app);
        $protected = [new AuthMiddleware($app['jwt_secret']), new PermissionMiddleware(new PermissionService($db))];

        $router->get($p('/media/{id}'), [$media, 'stream']);
        $router->get($p('/admin/media/unused'), [$media, 'unused'], $protected);
        $router->get($p('/admin/media/missing'), [$media, 'missing'], $protected);
        $router->post($p('/admin/media/purge-missing'), [$media, 'purgeMissing'], $protected);
        $router->get($p('/admin/media'), [$media, 'index'], $protected);
        $router->post($p('/admin/media'), [$media, 'upload'], $protected);
        $router->put($p('/admin/media/{id}'), [$media, 'update'], $protected);
        $router->post($p('/admin/media/{id}/replace'), [$media, 'replace'], $protected);
        // POST destroy — reliable on shared hosting where DELETE may be blocked
        $router->post($p('/admin/media/{id}/destroy'), [$media, 'delete'], $protected);
        $router->delete($p('/admin/media/{id}'), [$media, 'delete'], $protected);
        $router->get($p('/admin/media/folders'), [$media, 'folders'], $protected);
        $router->post($p('/admin/media/folders'), [$media, 'folderCreate'], $protected);
        $router->put($p('/admin/media/folders/{id}'), [$media, 'folderUpdate'], $protected);
        $router->delete($p('/admin/media/folders/{id}'), [$media, 'folderDelete'], $protected);
    }

    public function adminNav(): array
    {
        return [
            ['group' => 'Media', 'path' => '/admin/media', 'label' => 'Media library', 'permission' => 'media.manage'],
        ];
    }

    public function resources(): array
    {
        return [
            ['key' => 'media', 'table' => 'media', 'soft_delete' => true],
        ];
    }
}
