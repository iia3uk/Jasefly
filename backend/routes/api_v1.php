<?php
declare(strict_types=1);

use App\Router;
use App\Request;
use App\Response;
use App\Controllers\PublicController;
use App\Controllers\AuthController;
use App\Controllers\AdminController;
use App\Controllers\MediaController;
use App\Controllers\TrashController;
use App\Controllers\SearchController;
use App\Controllers\ActivityController;
use App\Controllers\SystemController;
use App\Middleware\AuthMiddleware;
use App\Middleware\RateLimitMiddleware;
use App\Middleware\PermissionMiddleware;
use App\Services\BackupService;
use App\Services\ActivityLogService;
use App\Services\SoftDeleteService;
use App\Services\PermissionService;

/**
 * Register all API routes under the given prefix (e.g. /api/v1 or /api).
 *
 * @param Router $router
 * @param \App\Database $db
 * @param array $app
 * @param string $prefix
 */
return function (Router $router, $db, array $app, string $prefix = '/api/v1'): void {
    $public = new PublicController($db, $app);
    $auth = new AuthController($db, $app);
    $admin = new AdminController($db, $app);
    $media = new MediaController($db, $app);
    $trash = new TrashController($db, new SoftDeleteService($db), new ActivityLogService($db));
    $search = new SearchController(new \App\Services\SearchService($db));
    $perms = new PermissionService($db);
    $activity = new ActivityController(new ActivityLogService($db), $perms);
    $system = new SystemController(new \App\Services\SystemHealthService($db, $app), $perms);

    $protected = [
        new AuthMiddleware($app['jwt_secret']),
        new PermissionMiddleware($perms),
    ];
    $rate = new RateLimitMiddleware($db);
    $loginRate = new RateLimitMiddleware($db, 5, 900, true);

    $p = fn(string $path) => rtrim($prefix, '/') . $path;

    // ─── Public ───────────────────────────────────────────────────────────────
    $router->get($p('/health'), [$public, 'health']);
    $router->get($p('/docs'), fn() => Response::json(['data' => require dirname(__DIR__) . '/docs/openapi.php']));
    $router->get($p('/site'), [$public, 'site']);
    $router->get($p('/profile'), [$public, 'profile']);
    $router->get($p('/statistics'), [$public, 'statistics']);
    $router->get($p('/experience'), [$public, 'experience']);
    $router->get($p('/education'), [$public, 'education']);
    $router->get($p('/skills'), [$public, 'skills']);
    $router->get($p('/services'), [$public, 'services']);
    $router->get($p('/testimonials'), [$public, 'testimonials']);
    $router->get($p('/projects'), [$public, 'projects']);
    $router->get($p('/projects/{slug}'), [$public, 'projects']);
    $router->get($p('/blog'), [$public, 'blog']);
    $router->get($p('/blog/{slug}'), [$public, 'blog']);
    $router->get($p('/contact-info'), [$public, 'contactInfo']);
    $router->get($p('/pages/{slug}'), [$public, 'page']);
    $router->get($p('/media/{id}'), [$media, 'stream']);
    $router->get($p('/search'), [$search, 'publicSearch'], [$rate]);
    $router->post($p('/contact'), [$public, 'contact'], [$rate]);
    $router->get($p('/sitemap.xml'), [$public, 'sitemap']);
    $router->get($p('/robots.txt'), [$public, 'robots']);

    // ─── Auth ─────────────────────────────────────────────────────────────────
    $router->post($p('/auth/login'), [$auth, 'login'], [$loginRate]);
    $router->post($p('/auth/refresh'), [$auth, 'refresh']);
    $router->post($p('/auth/logout'), [$auth, 'logout']);
    $router->get($p('/auth/me'), [$auth, 'me'], $protected);

    // ─── Admin ────────────────────────────────────────────────────────────────
    $router->get($p('/admin/dashboard'), [$admin, 'dashboard'], $protected);
    $router->get($p('/admin/search'), [$search, 'global'], $protected);
    $router->get($p('/admin/activity'), [$activity, 'index'], $protected);
    $router->get($p('/admin/system/status'), [$system, 'status'], $protected);
    $router->get($p('/admin/roles'), [$system, 'roles'], $protected);
    $router->get($p('/admin/permissions'), [$system, 'permissions'], $protected);

    $resources = [
        'social-links', 'statistics', 'experience', 'education', 'skill-categories', 'skills',
        'projects', 'project-categories', 'blog', 'blog-categories', 'blog-tags', 'services',
        'testimonials', 'navigation', 'homepage-sections', 'pages',
    ];

    foreach ($resources as $resource) {
        $base = $p("/admin/$resource");
        $router->get($base, fn(Request $r) => $admin->index($r, $resource), $protected);
        $router->post($base, fn(Request $r) => $admin->create($r, $resource), $protected);
        $router->get("$base/{id}", fn(Request $r, $id) => $admin->show($r, $resource, $id), $protected);
        $router->put("$base/{id}", fn(Request $r, $id) => $admin->update($r, $resource, $id), $protected);
        $router->delete("$base/{id}", fn(Request $r, $id) => $admin->delete($r, $resource, $id), $protected);
    }

    $router->post($p('/admin/projects/{id}/publish'), fn(Request $r, $id) => $admin->publish($r, 'projects', $id), $protected);
    $router->post($p('/admin/projects/reorder'), fn(Request $r) => $admin->reorder($r, 'projects'), $protected);
    $router->post($p('/admin/navigation/reorder'), fn(Request $r) => $admin->reorder($r, 'navigation'), $protected);
    $router->post($p('/admin/skills/reorder'), fn(Request $r) => $admin->reorder($r, 'skills'), $protected);
    $router->post($p('/admin/blog/{id}/publish'), fn(Request $r, $id) => $admin->publish($r, 'blog', $id), $protected);

    foreach (['profile', 'contact-info', 'footer', 'hero', 'seo', 'site-settings', 'theme', 'email-settings'] as $singleton) {
        $router->get($p("/admin/$singleton"), fn(Request $r) => $admin->singletonGet($r, $singleton), $protected);
        $router->put($p("/admin/$singleton"), fn(Request $r) => $admin->singleton($r, $singleton), $protected);
    }

    $router->get($p('/admin/contact-messages'), [$admin, 'messages'], $protected);
    $router->delete($p('/admin/contact-messages/{id}'), [$admin, 'deleteMessage'], $protected);
    $router->post($p('/admin/contact-messages/{id}/mark-read'), [$admin, 'readMessage'], $protected);
    $router->put($p('/admin/users/password'), [$admin, 'password'], $protected);

    // Trash
    $router->get($p('/admin/trash'), [$trash, 'index'], $protected);
    $router->post($p('/admin/trash/{resource}/{id}/restore'), fn(Request $r, $resource, $id) => $trash->restore($r, $resource, $id), $protected);
    $router->delete($p('/admin/trash/{resource}/{id}'), fn(Request $r, $resource, $id) => $trash->forceDelete($r, $resource, $id), $protected);
    $router->post($p('/admin/trash/{resource}/empty'), fn(Request $r, $resource) => $trash->emptyTrash($r, $resource), $protected);
    $router->post($p('/admin/trash/empty-all'), [$trash, 'emptyAll'], $protected);

    // Media
    $router->get($p('/admin/media/unused'), [$media, 'unused'], $protected);
    $router->get($p('/admin/media/missing'), [$media, 'missing'], $protected);
    $router->post($p('/admin/media/purge-missing'), [$media, 'purgeMissing'], $protected);
    $router->get($p('/admin/media'), [$media, 'index'], $protected);
    $router->post($p('/admin/media'), [$media, 'upload'], $protected);
    $router->put($p('/admin/media/{id}'), [$media, 'update'], $protected);
    $router->post($p('/admin/media/{id}/replace'), [$media, 'replace'], $protected);
    $router->post($p('/admin/media/{id}/destroy'), [$media, 'delete'], $protected);
    $router->delete($p('/admin/media/{id}'), [$media, 'delete'], $protected);
    $router->get($p('/admin/media/folders'), [$media, 'folders'], $protected);
    $router->post($p('/admin/media/folders'), [$media, 'folderCreate'], $protected);
    $router->put($p('/admin/media/folders/{id}'), [$media, 'folderUpdate'], $protected);
    $router->delete($p('/admin/media/folders/{id}'), [$media, 'folderDelete'], $protected);

    $router->post($p('/admin/backup'), function (Request $r) use ($db, $app) {
        Response::json(['data' => ['file' => (new BackupService($db, $app))->create()]], 201);
    }, $protected);
};
