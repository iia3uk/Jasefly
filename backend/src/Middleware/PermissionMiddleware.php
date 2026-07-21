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
            // Media hard-delete is also allowed via media.manage / POST destroy
            if (!str_contains($r->path, '/admin/media')) {
                $this->permissions->require($user, 'content.delete');
            } elseif (!$this->permissions->can($user, 'media.manage') && !$this->permissions->can($user, 'content.delete')) {
                $this->permissions->require($user, 'media.manage');
            }
        }

        if (in_array($r->method, ['POST', 'PUT'], true) && str_contains($r->path, '/admin/') && !str_contains($r->path, '/publish')) {
            $perm = $r->method === 'POST' ? 'content.create' : 'content.update';
            if (!$this->permissions->can($user, $perm) && !$this->permissions->can($user, 'content.view')) {
                // Allow singleton settings updates only if settings.manage (handled above)
            }
        }

        return $next();
    }
}
