<?php
declare(strict_types=1);

namespace App\Modules\Content;

use App\Controllers\PublicController;
use App\Core\AbstractModule;
use App\Database;
use App\Middleware\AuthMiddleware;
use App\Middleware\PermissionMiddleware;
use App\Middleware\RateLimitMiddleware;
use App\Controllers\AdminController;
use App\Request;
use App\Router;
use App\Services\PermissionService;

/**
 * Public site feed + generic admin CRUD resources.
 * Future content types can either extend this pattern or ship their own module.
 */
final class ContentModule extends AbstractModule
{
    public function name(): string
    {
        return 'content';
    }

    public function label(): string
    {
        return 'Content';
    }

    public function priority(): int
    {
        return 20;
    }

    public function registerRoutes(Router $router, Database $db, array $app, string $apiPrefix): void
    {
        $p = fn(string $path) => rtrim($apiPrefix, '/') . $path;
        $public = new PublicController($db, $app);
        $admin = new AdminController($db, $app);
        $rate = new RateLimitMiddleware($db);
        $protected = [new AuthMiddleware($app['jwt_secret']), new PermissionMiddleware(new PermissionService($db))];

        $router->get($p('/site'), [$public, 'site']);
        $router->get($p('/profile'), [$public, 'profile']);
        $router->get($p('/statistics'), [$public, 'statistics']);
        $router->get($p('/experience'), [$public, 'experience']);
        $router->get($p('/education'), [$public, 'education']);
        $router->get($p('/skills'), [$public, 'skills']);
        // Public project list/detail stay on Content (portfolio gate in PublicController).
        // Admin projects CRUD lives on ProjectsModule with soft-disabled Design B.
        $router->get($p('/projects'), [$public, 'projects']);
        $router->get($p('/projects/{slug}'), [$public, 'projects']);
        $router->get($p('/services'), [$public, 'services']);
        $router->get($p('/testimonials'), [$public, 'testimonials']);
        $router->get($p('/contact-info'), [$public, 'contactInfo']);
        $router->get($p('/pages/{slug}'), [$public, 'page']);
        $router->post($p('/contact'), [$public, 'contact'], [$rate]);
        $router->get($p('/sitemap.xml'), [$public, 'sitemap']);
        $router->get($p('/robots.txt'), [$public, 'robots']);

        $resources = [
            'social-links', 'statistics', 'experience', 'education', 'skill-categories', 'skills',
            'blog-categories', 'blog-tags',
            'testimonials', 'navigation', 'homepage-sections', 'pages',
            'services',
        ];

        foreach ($resources as $resource) {
            $base = $p("/admin/$resource");
            $router->get($base, fn(Request $r) => $admin->index($r, $resource), $protected);
            $router->post($base, fn(Request $r) => $admin->create($r, $resource), $protected);
            $router->get("$base/{id}", fn(Request $r, $id) => $admin->show($r, $resource, $id), $protected);
            $router->put("$base/{id}", fn(Request $r, $id) => $admin->update($r, $resource, $id), $protected);
            $router->delete("$base/{id}", fn(Request $r, $id) => $admin->delete($r, $resource, $id), $protected);
        }

        $router->post($p('/admin/navigation/reorder'), fn(Request $r) => $admin->reorder($r, 'navigation'), $protected);
        $router->post($p('/admin/skills/reorder'), fn(Request $r) => $admin->reorder($r, 'skills'), $protected);
    }

    public function adminNav(): array
    {
        // Site chrome + structure. Portfolio-specific items stay on PortfolioModule.
        return [
            ['group' => 'Site', 'path' => '/admin/navigation', 'label' => 'Navigation'],
            ['group' => 'Site', 'path' => '/admin/homepage', 'label' => 'Homepage'],
            ['group' => 'Site', 'path' => '/admin/hero', 'label' => 'Hero'],
            ['group' => 'Site', 'path' => '/admin/footer', 'label' => 'Footer'],
            ['group' => 'Site', 'path' => '/admin/social-links', 'label' => 'Social links'],
            ['group' => 'Site', 'path' => '/admin/contact-info', 'label' => 'Contact info'],
            ['group' => 'Site', 'path' => '/admin/messages', 'label' => 'Messages'],
        ];
    }

    public function resources(): array
    {
        return [
            ['key' => 'social-links', 'table' => 'social_links', 'soft_delete' => false],
            ['key' => 'experience', 'table' => 'experience', 'soft_delete' => true],
            ['key' => 'skills', 'table' => 'skills', 'soft_delete' => true],
            ['key' => 'services', 'table' => 'services', 'soft_delete' => true, 'sluggable' => true],
            ['key' => 'testimonials', 'table' => 'testimonials', 'soft_delete' => true],
            ['key' => 'pages', 'table' => 'pages', 'sluggable' => true],
        ];
    }

    public function blueprints(): array
    {
        return [
            [
                'key' => 'social-links',
                'table' => 'social_links',
                'label' => 'Соцсети',
                'group' => 'Site',
                'orderable' => true,
                'icon' => 'globe',
                'columns' => [
                    'platform' => ['type' => 'string', 'widget' => 'text', 'required' => true, 'label' => 'Платформа'],
                    'label' => ['type' => 'string', 'widget' => 'text', 'label' => 'Название'],
                    'url' => ['type' => 'string', 'widget' => 'url', 'required' => true, 'label' => 'URL'],
                    'icon' => ['type' => 'string', 'widget' => 'text', 'label' => 'Иконка'],
                    'sort_order' => ['type' => 'int', 'widget' => 'number', 'default' => 0, 'label' => 'Порядок'],
                    'is_visible' => ['type' => 'bool', 'widget' => 'toggle', 'default' => true, 'label' => 'Видим'],
                ],
                'permissions' => ['content.view', 'content.edit'],
            ],
            [
                'key' => 'services',
                'table' => 'services',
                'label' => 'Services',
                'soft_delete' => true,
                'slug' => true,
                'group' => 'Content',
                'orderable' => true,
                'icon' => 'settings',
                'columns' => [
                    'title' => ['type' => 'string', 'widget' => 'text', 'required' => true, 'label' => 'Title'],
                    'short_description' => ['type' => 'text', 'widget' => 'textarea', 'label' => 'Short description'],
                    'description' => ['type' => 'longtext', 'widget' => 'richtext', 'label' => 'Description'],
                    'icon' => ['type' => 'string', 'widget' => 'text', 'label' => 'Icon'],
                    'price_label' => ['type' => 'string', 'widget' => 'text', 'label' => 'Price label (display)'],
                    'price' => ['type' => 'decimal', 'widget' => 'number', 'label' => 'Цена (оплата)', 'nullable' => true],
                    'currency' => ['type' => 'string', 'widget' => 'text', 'default' => 'RUB', 'label' => 'Валюта'],
                    'is_purchasable' => ['type' => 'bool', 'widget' => 'toggle', 'default' => false, 'label' => 'Можно купить'],
                    'offer_text' => ['type' => 'text', 'widget' => 'textarea', 'label' => 'Условия / оферта (кратко)', 'nullable' => true],
                    'duration_label' => ['type' => 'string', 'widget' => 'text', 'label' => 'Срок / формат', 'nullable' => true],
                    'features' => ['type' => 'json', 'widget' => 'json', 'label' => 'Features'],
                    'sort_order' => ['type' => 'int', 'widget' => 'number', 'default' => 0, 'label' => 'Sort order'],
                    'is_visible' => ['type' => 'bool', 'widget' => 'toggle', 'default' => true, 'label' => 'Visible'],
                ],
                'indexes' => [
                    ['name' => 'idx_services_sort', 'columns' => ['sort_order'], 'type' => 'index'],
                ],
                'permissions' => ['content.view', 'content.edit', 'content.delete'],
            ],
            [
                'key' => 'testimonials',
                'table' => 'testimonials',
                'label' => 'Testimonials',
                'soft_delete' => true,
                'group' => 'Content',
                'orderable' => true,
                'icon' => 'message-square',
                'columns' => [
                    'author_name' => ['type' => 'string', 'widget' => 'text', 'required' => true, 'label' => 'Author name'],
                    'author_role' => ['type' => 'string', 'widget' => 'text', 'label' => 'Author role'],
                    'author_company' => ['type' => 'string', 'widget' => 'text', 'label' => 'Author company'],
                    'content' => ['type' => 'text', 'widget' => 'textarea', 'required' => true, 'label' => 'Content'],
                    'rating' => ['type' => 'int', 'widget' => 'number', 'label' => 'Rating', 'min' => 1, 'max' => 5],
                    'sort_order' => ['type' => 'int', 'widget' => 'number', 'default' => 0, 'label' => 'Sort order'],
                    'is_visible' => ['type' => 'bool', 'widget' => 'toggle', 'default' => true, 'label' => 'Visible'],
                ],
                'indexes' => [
                    ['name' => 'idx_testimonials_sort', 'columns' => ['sort_order'], 'type' => 'index'],
                ],
                'permissions' => ['content.view', 'content.edit', 'content.delete'],
            ],
        ];
    }
}
