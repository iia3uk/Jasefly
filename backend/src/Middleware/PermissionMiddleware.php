<?php
declare(strict_types=1);

namespace App\Middleware;

use App\Request;
use App\Response;
use App\Services\PermissionService;

final class PermissionMiddleware
{
    public function __construct(private PermissionService $permissions) {}

    public function __invoke(Request $r, callable $next): mixed
    {
        $user = $r->user ?? null;
        if (!$user) {
            Response::error('Unauthorized', 401);
        }

        if ($this->permissions->isSystemRoute($r->path)) {
            $this->permissions->require($user, 'system.manage');
        } elseif ($this->permissions->isSettingsRoute($r->path)) {
            $this->permissions->require($user, 'settings.manage');
        }

        if (str_contains($r->path, '/admin/trash') && str_contains($r->path, 'force')) {
            $this->permissions->require($user, 'content.force_delete');
        }

        if (str_contains($r->path, '/admin/trash') && $r->method !== 'GET') {
            $this->permissions->require($user, 'content.restore');
        }

        if ($r->method === 'DELETE' && str_contains($r->path, '/admin/')) {
            // Domain plugins own their DELETE with module perms — don't force content.delete.
            $moduleDeleteExempt =
                str_contains($r->path, '/admin/media')
                || str_contains($r->path, '/admin/forms')
                || str_contains($r->path, '/admin/form-submissions')
                || str_contains($r->path, '/admin/orders')
                || str_contains($r->path, '/admin/comments')
                || str_contains($r->path, '/admin/automations')
                || str_contains($r->path, '/admin/newsletter')
                || str_contains($r->path, '/admin/notifications')
                || str_contains($r->path, '/admin/scheduler');
            if (!$moduleDeleteExempt) {
                $this->permissions->require($user, 'content.delete');
            } elseif (str_contains($r->path, '/admin/media')
                && !$this->permissions->can($user, 'media.manage')
                && !$this->permissions->can($user, 'content.delete')) {
                $this->permissions->require($user, 'media.manage');
            }
        }

        // CRUD create/update for content resources is enforced in AdminController /
        // module handlers (resource-specific permissions). Do not blanket-require
        // content.create/update on every admin POST/PUT — that breaks module routes.

        return $next();
    }
}
