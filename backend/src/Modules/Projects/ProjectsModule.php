<?php
declare(strict_types=1);

namespace App\Modules\Projects;

use App\Controllers\AdminController;
use App\Core\AbstractModule;
use App\Database;
use App\Middleware\AuthMiddleware;
use App\Middleware\PermissionMiddleware;
use App\Request;
use App\Router;
use App\Services\PermissionService;

final class ProjectsModule extends AbstractModule
{
    public function name(): string
    {
        return 'projects';
    }

    public function label(): string
    {
        return 'Projects';
    }

    public function priority(): int
    {
        return 30;
    }

    public function registerRoutes(Router $router, Database $db, array $app, string $apiPrefix): void
    {
        $p = fn(string $path) => rtrim($apiPrefix, '/') . $path;
        $admin = new AdminController($db, $app);
        $protected = [new AuthMiddleware($app['jwt_secret']), new PermissionMiddleware(new PermissionService($db))];

        // Public GET /projects lives on ContentModule (always available; empty when portfolio off).

        $base = $p('/admin/projects');
        $router->get($base, fn(Request $r) => $admin->index($r, 'projects'), $protected);
        $router->post($base, fn(Request $r) => $admin->create($r, 'projects'), $protected);
        $router->get("$base/{id}", fn(Request $r, $id) => $admin->show($r, 'projects', $id), $protected);
        $router->put("$base/{id}", fn(Request $r, $id) => $admin->update($r, 'projects', $id), $protected);
        $router->delete("$base/{id}", fn(Request $r, $id) => $admin->delete($r, 'projects', $id), $protected);
        $router->post("$base/{id}/publish", fn(Request $r, $id) => $admin->publish($r, 'projects', $id), $protected);
        $router->post($p('/admin/projects/reorder'), fn(Request $r) => $admin->reorder($r, 'projects'), $protected);
    }

    public function adminNav(): array
    {
        return [
            ['group' => 'Content', 'path' => '/admin/projects', 'label' => 'Projects'],
        ];
    }

    public function resources(): array
    {
        return [
            ['key' => 'projects', 'table' => 'projects', 'soft_delete' => true, 'sluggable' => true],
            ['key' => 'project-categories', 'table' => 'project_categories', 'soft_delete' => true, 'sluggable' => true],
        ];
    }

    public function blueprints(): array
    {
        return [
            [
                'key' => 'projects',
                'table' => 'projects',
                'label' => 'Projects',
                'soft_delete' => true,
                'slug' => true,
                'seo' => true,
                'group' => 'Content',
                'orderable' => true,
                'icon' => 'folder',
                'columns' => [
                    'title' => ['type' => 'string', 'widget' => 'text', 'required' => true, 'label' => 'Title'],
                    'short_description' => ['type' => 'text', 'widget' => 'textarea', 'label' => 'Short description'],
                    'description' => ['type' => 'longtext', 'widget' => 'richtext', 'label' => 'Description'],
                    'content' => ['type' => 'longtext', 'widget' => 'richtext', 'label' => 'Content'],
                    'status' => ['type' => 'string', 'widget' => 'select', 'default' => 'draft', 'label' => 'Status',
                        'options' => [
                            ['value' => 'draft', 'label' => 'Draft'],
                            ['value' => 'published', 'label' => 'Published'],
                            ['value' => 'archived', 'label' => 'Archived'],
                        ]],
                    'project_status' => ['type' => 'string', 'widget' => 'select', 'default' => 'completed', 'label' => 'Project status',
                        'options' => [
                            ['value' => 'completed', 'label' => 'Completed'],
                            ['value' => 'in_progress', 'label' => 'In progress'],
                            ['value' => 'on_hold', 'label' => 'Frozen'],
                            ['value' => 'concept', 'label' => 'Concept'],
                            ['value' => 'cancelled', 'label' => 'Cancelled'],
                        ]],
                    'is_featured' => ['type' => 'bool', 'widget' => 'toggle', 'default' => false, 'label' => 'Featured'],
                    'sort_order' => ['type' => 'int', 'widget' => 'number', 'default' => 0, 'label' => 'Sort order'],
                    'role' => ['type' => 'string', 'widget' => 'text', 'label' => 'Role'],
                    'github_url' => ['type' => 'string', 'widget' => 'url', 'label' => 'GitHub URL'],
                    'website_url' => ['type' => 'string', 'widget' => 'url', 'label' => 'Website URL'],
                    'video_url' => ['type' => 'string', 'widget' => 'url', 'label' => 'Video URL'],
                ],
                'indexes' => [
                    ['name' => 'idx_projects_status', 'columns' => ['status'], 'type' => 'index'],
                    ['name' => 'idx_projects_featured', 'columns' => ['is_featured'], 'type' => 'index'],
                ],
                'permissions' => ['content.view', 'content.edit', 'content.delete'],
            ],
        ];
    }

    public function hooks(): array
    {
        return [
            ['resource.afterSave', function (array $payload): void {
                if (($payload['resource'] ?? '') !== 'projects') {
                    return;
                }
                // Hook consumers can extend search indexing, cache invalidation,
                // webhook dispatch, etc. The kernel guarantees ordering by priority.
            }, 10],
        ];
    }
}
