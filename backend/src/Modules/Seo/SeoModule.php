<?php
declare(strict_types=1);

namespace App\Modules\Seo;

use App\Core\AbstractModule;
use App\Core\Container;
use App\Core\EventDispatcher;
use App\Database;
use App\Middleware\AuthMiddleware;
use App\Middleware\PermissionMiddleware;
use App\Request;
use App\Response;
use App\Router;
use App\Services\PermissionService;
use App\Services\PathRedirectService;
use App\Services\PrerenderService;

/**
 * SEO settings routes are registered via SystemModule singletons.
 * Prerender cache flush lives here.
 */
final class SeoModule extends AbstractModule
{
    public function name(): string
    {
        return 'seo';
    }

    public function label(): string
    {
        return 'SEO';
    }

    public function priority(): int
    {
        return 80;
    }

    public function boot(Database $db, array $app): void
    {
        // Авто-сброс HTML-кэша для ботов при любом сохранении контента.
        $events = Container::getInstance()->get(EventDispatcher::class);
        $flush = static function () use ($db, $app): void {
            try {
                (new PrerenderService($db, $app))->flushCache();
            } catch (\Throwable) {
                // never break save flow
            }
        };
        $events->subscribe('resource.afterSave', function (array $payload) use ($flush): void {
            static $watch = [
                'pages', 'projects', 'blog', 'blog_posts', 'services', 'profile',
                'hero', 'hero_settings', 'site-settings', 'site_settings', 'seo', 'seo_settings',
                'navigation', 'navigation_items', 'homepage_sections', 'testimonials',
            ];
            $resource = (string) ($payload['resource'] ?? '');
            $table = (string) ($payload['table'] ?? '');
            if (in_array($resource, $watch, true) || in_array($table, $watch, true)) {
                $flush();
            }
        });
        $events->subscribe('page.afterPublish', function () use ($flush): void {
            $flush();
        });
        $events->subscribe('resource.afterDelete', function () use ($flush): void {
            $flush();
        });
    }

    public function registerRoutes(Router $router, Database $db, array $app, string $apiPrefix): void
    {
        $p = static fn(string $path): string => $apiPrefix . $path;
        $protected = [new AuthMiddleware($app['jwt_secret']), new PermissionMiddleware(new PermissionService($db))];

        $router->post($p('/admin/seo/prerender-flush'), function () use ($db, $app) {
            $n = (new PrerenderService($db, $app))->flushCache();
            Response::json([
                'success' => true,
                'data' => [
                    'cleared' => $n,
                    'message' => "Кэш prerender очищен ({$n} файлов). Новые снимки соберутся при следующем заходе бота.",
                ],
            ]);
        }, $protected);

        $router->get($p('/admin/seo/prerender-preview'), function (Request $r) use ($db, $app) {
            $path = (string) ($r->query('path') ?? '/');
            $svc = new PrerenderService($db, $app);
            $result = $svc->render($path, false);
            Response::json([
                'success' => true,
                'data' => [
                    'path' => $path,
                    'status' => $result['status'],
                    'html_preview' => mb_substr(strip_tags($result['html']), 0, 500),
                    'bytes' => strlen($result['html']),
                ],
            ]);
        }, $protected);

        // Manual path redirects CRUD (+ auto slug list)
        $redirects = fn(): PathRedirectService => new PathRedirectService($db);
        $router->get($p('/admin/redirects'), function () use ($redirects) {
            Response::json(['data' => $redirects()->listAll()]);
        }, $protected);
        $router->get($p('/admin/redirects/slug'), function () use ($db) {
            try {
                $rows = $db->all(
                    'SELECT id, entity_type, old_slug, new_slug, entity_id, created_at
                     FROM slug_redirects ORDER BY id DESC LIMIT 200'
                );
            } catch (\Throwable) {
                $rows = [];
            }
            Response::json(['data' => $rows]);
        }, $protected);
        $router->delete($p('/admin/redirects/slug/{id}'), function (string $id) use ($db) {
            try {
                $db->run('DELETE FROM slug_redirects WHERE id=?', [(int) $id]);
            } catch (\Throwable) {
                Response::error('Not found', 404);
            }
            Response::json(['success' => true, 'message' => 'Deleted']);
        }, $protected);
        $router->post($p('/admin/redirects'), function (Request $r) use ($redirects) {
            $row = $redirects()->create($r->all());
            Response::json(['data' => $row], 201);
        }, $protected);
        $router->put($p('/admin/redirects/{id}'), function (Request $r, string $id) use ($redirects) {
            $row = $redirects()->update((int) $id, $r->all());
            Response::json(['data' => $row]);
        }, $protected);
        $router->delete($p('/admin/redirects/{id}'), function (string $id) use ($redirects) {
            $redirects()->delete((int) $id);
            Response::json(['success' => true, 'message' => 'Deleted']);
        }, $protected);
    }

    public function adminNav(): array
    {
        return [
            ['group' => 'System', 'path' => '/admin/seo', 'label' => 'SEO', 'permission' => 'settings.manage'],
            ['group' => 'System', 'path' => '/admin/redirects', 'label' => 'Redirects', 'permission' => 'settings.manage'],
            ['group' => 'System', 'path' => '/admin/site-settings', 'label' => 'Site', 'permission' => 'settings.manage'],
            ['group' => 'System', 'path' => '/admin/theme', 'label' => 'Site template', 'permission' => 'settings.manage'],
            ['group' => 'System', 'path' => '/admin/email', 'label' => 'Email', 'permission' => 'settings.manage'],
        ];
    }
}
