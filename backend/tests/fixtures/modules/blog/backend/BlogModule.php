<?php
declare(strict_types=1);

namespace App\PackageModules\Blog;

use App\Platform\Contracts\PlatformRequestInterface;
use App\Platform\Package\AbstractPackageModule;
use App\Platform\Package\PlatformResponse;
use App\Platform\PlatformContext;

final class BlogModule extends AbstractPackageModule
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

    public function adminNav(): array
    {
        return [[
            'group' => 'Content',
            'path' => '/admin/blog',
            'label' => 'Blog',
            'permission' => 'content.view',
            'icon' => 'newspaper',
        ]];
    }

    public function blocks(): array
    {
        return [['type' => 'blog-list', 'label' => 'Blog grid', 'category' => 'content']];
    }

    public function bootPlatform(PlatformContext $ctx): void
    {
        parent::bootPlatform($ctx);
        foreach (['api.routes', 'admin.pages', 'permissions.check', 'events.publish', 'builder.widgets'] as $cap) {
            $ctx->capabilities()->require($cap);
        }
        $ctx->events()->declare('blog.post.created', [
            'label' => 'Blog post created',
            'category' => 'blog',
            'payload' => ['post' => 'object'],
        ]);
        $ctx->resources()->register('blog', [
            'table' => 'blog_posts',
            'public' => true,
            'relations' => ['tags'],
        ], new BlogResourceHandler($ctx->database()));

        $http = $ctx->http();
        $resources = $ctx->resources();
        $perms = $ctx->permissions();
        $events = $ctx->events();
        $protected = [$http->authMiddleware(), $http->permissionMiddleware()];

        $http->get('/blog', static function (PlatformRequestInterface $r) use ($resources): void {
            PlatformResponse::json(['data' => ($resources->publicList('blog', $r->query())['items'] ?? [])]);
        });
        $http->get('/blog/{slug}', static function (PlatformRequestInterface $r, string $slug) use ($resources): void {
            $post = $resources->publicGet('blog', $slug);
            $post ? PlatformResponse::json(['data' => $post]) : PlatformResponse::error('Not found', 404);
        });

        $http->get('/admin/blog', static function (PlatformRequestInterface $r) use ($resources, $perms): void {
            $perms->require($r->user() ?? [], 'content.view');
            PlatformResponse::json(['data' => ($resources->list('blog', $r->query())['items'] ?? [])]);
        }, $protected);
        $http->post('/admin/blog', static function (PlatformRequestInterface $r) use ($resources, $perms, $events): void {
            $perms->require($r->user() ?? [], 'content.edit');
            $result = $resources->create('blog', $r->body(), $r->user());
            if (($result['ok'] ?? false) && is_array($result['data'] ?? null)) {
                $events->publish('blog.post.created', ['post' => $result['data']]);
            }
            self::respond($result, 201);
        }, $protected);
        $http->get('/admin/blog/{id}', static function (PlatformRequestInterface $r, string $id) use ($resources, $perms): void {
            $perms->require($r->user() ?? [], 'content.view');
            $item = $resources->get('blog', $id);
            $item ? PlatformResponse::json(['data' => $item]) : PlatformResponse::error('Not found', 404);
        }, $protected);
        $http->put('/admin/blog/{id}', static function (PlatformRequestInterface $r, string $id) use ($resources, $perms): void {
            $perms->require($r->user() ?? [], 'content.edit');
            self::respond($resources->update('blog', $id, $r->body(), $r->user()));
        }, $protected);
        $http->delete('/admin/blog/{id}', static function (PlatformRequestInterface $r, string $id) use ($resources, $perms): void {
            $perms->require($r->user() ?? [], 'content.delete');
            self::respond($resources->delete('blog', $id, $r->user()));
        }, $protected);
        $http->post('/admin/blog/{id}/publish', static function (PlatformRequestInterface $r, string $id) use ($resources, $perms): void {
            $perms->require($r->user() ?? [], 'content.edit');
            self::respond($resources->publish('blog', $id, (string) ($r->body()['status'] ?? 'published'), $r->user()));
        }, $protected);
    }

    private static function respond(array $result, int $okStatus = 200): void
    {
        if ($result['ok'] ?? false) {
            PlatformResponse::json(['data' => $result['data'] ?? null], $okStatus);
        }
        $status = ($result['code'] ?? '') === 'not_found' ? 404 : (($result['code'] ?? '') === 'validation' ? 422 : 409);
        PlatformResponse::error((string) ($result['error'] ?? 'Request failed'), $status);
    }
}
