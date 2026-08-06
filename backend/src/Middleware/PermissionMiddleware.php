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

        $pathCap = $this->permissions->capabilityForAdminPath($r->path);
        if ($pathCap !== null) {
            $this->permissions->require($user, $pathCap);
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
                || str_contains($r->path, '/admin/scheduler')
                || str_contains($r->path, '/admin/webhooks');
            if (str_contains($r->path, '/admin/webhooks')) {
                $this->permissions->require($user, 'integrations.manage');
            } elseif (!$moduleDeleteExempt) {
                $this->permissions->require($user, 'content.delete');
            } elseif (str_contains($r->path, '/admin/media')
                && !$this->permissions->can($user, 'media.manage')
                && !$this->permissions->can($user, 'content.delete')) {
                $this->permissions->require($user, 'media.manage');
            }
        }

        // Content create/update/publish and revision restore: explicit capability checks
        // (Auth alone is insufficient). Handlers also call PermissionService for defense-in-depth.
        $method = strtoupper($r->method);
        if (in_array($method, ['POST', 'PUT', 'PATCH'], true)) {
            if (preg_match('#/admin/pages/revisions/\d+/restore$#', $r->path)) {
                $this->permissions->requireContentMutation($user, 'update');
            } elseif (preg_match('#/admin/pages/\d+/revisions$#', $r->path) && $method === 'POST') {
                $this->permissions->requireContentMutation($user, 'update');
            } elseif (preg_match('#/admin/pages/\d+/copy-layout$#', $r->path) && $method === 'POST') {
                $this->permissions->requireContentMutation($user, 'update');
            } elseif (str_contains($r->path, '/admin/webhooks')) {
                $this->permissions->require($user, 'integrations.manage');
            } else {
                $resources = implode('|', array_map(
                    static fn(string $name): string => preg_quote($name, '#'),
                    PermissionService::contentResources()
                ));
                if ($resources !== '') {
                    if (preg_match('#/admin/(' . $resources . ')$#', $r->path) && $method === 'POST') {
                        $this->permissions->requireContentMutation($user, 'create');
                    } elseif (preg_match('#/admin/(' . $resources . ')/reorder$#', $r->path)) {
                        $this->permissions->requireContentMutation($user, 'update');
                    } elseif (preg_match('#/admin/(' . $resources . ')/\d+/publish$#', $r->path)) {
                        $this->permissions->requireContentMutation($user, 'publish');
                    } elseif (
                        preg_match('#/admin/(' . $resources . ')/\d+$#', $r->path)
                        && in_array($method, ['PUT', 'PATCH'], true)
                    ) {
                        $this->permissions->requireContentMutation($user, 'update');
                    }
                }
            }
        }

        return $next();
    }
}
