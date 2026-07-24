<?php
declare(strict_types=1);

namespace App\Modules\Lab;

use App\Core\AbstractModule;
use App\Database;
use App\Jwt;
use App\Middleware\AuthMiddleware;
use App\Middleware\PermissionMiddleware;
use App\Request;
use App\Response;
use App\Router;
use App\Services\ActivityLogService;
use App\Services\PermissionService;
use App\Support\AuthCookie;

/**
 * Jasefly Lab — isolated visual/functional experiments.
 * Does not touch Page Builder, site theme, or production pages.
 */
final class LabModule extends AbstractModule
{
    public function name(): string
    {
        return 'lab';
    }

    public function label(): string
    {
        return 'Jasefly Lab';
    }

    public function priority(): int
    {
        return 70;
    }

    public function adminNav(): array
    {
        return [
            [
                'group' => 'Разработка',
                'path' => '/admin/lab',
                'label' => 'Jasefly Lab',
                'permission' => 'lab.view',
                'icon' => 'sparkles',
            ],
        ];
    }

    public function resources(): array
    {
        return [
            [
                'key' => 'lab-experiments',
                'table' => 'lab_experiments',
                'soft_delete' => true,
                'sluggable' => true,
            ],
        ];
    }

    public function publicRoutes(): array
    {
        return [
            ['path' => '/lab/:slug', 'name' => 'lab.experiment'],
        ];
    }

    public function registerRoutes(Router $router, Database $db, array $app, string $apiPrefix): void
    {
        $p = fn(string $path) => rtrim($apiPrefix, '/') . $path;
        $perms = new PermissionService($db);
        $protected = [new AuthMiddleware($app['jwt_secret']), new PermissionMiddleware($perms)];
        $svc = new LabService($db);
        $activity = new ActivityLogService($db);

        $require = function (Request $r, string $permission) use ($perms): void {
            $user = $r->user ?? null;
            if (!$user || !$perms->can($user, $permission)) {
                Response::error("Forbidden: {$permission} required", 403);
            }
        };

        // —— Public resolve ——
        $router->get($p('/lab/{slug}'), function (Request $r, string $slug) use ($svc, $perms, $app) {
            $staff = $this->staffCanPreview($r, $perms, $app);
            $res = $svc->resolvePublic($slug, $staff);
            if (!$res['ok']) {
                $status = (int) ($res['status'] ?? 404);
                Response::error(
                    (string) ($res['error'] ?? 'Not found'),
                    $status,
                    isset($res['code']) ? ['code' => $res['code']] : []
                );
            }
            Response::json(['data' => $res['data']]);
        });

        // —— Admin: entries whitelist ——
        $router->get($p('/admin/lab/entries'), function (Request $r) use ($require) {
            $require($r, 'lab.view');
            Response::json(['data' => LabEntryRegistry::list()]);
        }, $protected);

        $base = $p('/admin/lab/experiments');

        $router->get($base, function (Request $r) use ($svc, $require) {
            $require($r, 'lab.view');
            $withTrash = ($r->query('trashed') ?? '') === '1';
            Response::json(['data' => $svc->list($withTrash)]);
        }, $protected);

        $router->post($base, function (Request $r) use ($svc, $require, $activity) {
            $require($r, 'lab.create');
            $res = $svc->create($r->all() ?: []);
            if (!$res['ok']) {
                Response::error((string) $res['error'], (int) ($res['status'] ?? 422), isset($res['code']) ? ['code' => $res['code']] : []);
            }
            $row = $res['data'];
            $activity->log($r, 'create', 'lab-experiments', (int) $row['id'], (string) $row['name']);
            Response::json(['data' => $row], 201);
        }, $protected);

        $router->get("$base/{id}", function (Request $r, string $id) use ($svc, $require) {
            $require($r, 'lab.view');
            $row = $svc->find((int) $id, true);
            if (!$row) {
                Response::error('Not found', 404);
            }
            Response::json(['data' => $row]);
        }, $protected);

        $router->put("$base/{id}", function (Request $r, string $id) use ($svc, $require, $activity) {
            $require($r, 'lab.update');
            $res = $svc->update((int) $id, $r->all() ?: []);
            if (!$res['ok']) {
                Response::error((string) $res['error'], (int) ($res['status'] ?? 422), isset($res['code']) ? ['code' => $res['code']] : []);
            }
            $row = $res['data'];
            $activity->log($r, 'update', 'lab-experiments', (int) $row['id'], (string) $row['name']);
            Response::json(['data' => $row]);
        }, $protected);

        $router->delete("$base/{id}", function (Request $r, string $id) use ($svc, $require, $activity) {
            $require($r, 'lab.delete');
            $before = $svc->find((int) $id);
            $res = $svc->softDelete((int) $id);
            if (!$res['ok']) {
                Response::error((string) $res['error'], (int) ($res['status'] ?? 404));
            }
            $activity->log($r, 'delete', 'lab-experiments', (int) $id, $before['name'] ?? null);
            Response::json(['message' => 'Deleted']);
        }, $protected);

        $router->post("$base/{id}/restore", function (Request $r, string $id) use ($svc, $require, $activity) {
            $require($r, 'lab.delete');
            $res = $svc->restore((int) $id);
            if (!$res['ok']) {
                Response::error((string) $res['error'], (int) ($res['status'] ?? 422), isset($res['code']) ? ['code' => $res['code']] : []);
            }
            $row = $res['data'];
            $activity->log($r, 'restore', 'lab-experiments', (int) $row['id'], (string) $row['name']);
            Response::json(['data' => $row]);
        }, $protected);

        $router->post("$base/{id}/activate", function (Request $r, string $id) use ($svc, $require, $activity) {
            $require($r, 'lab.publish');
            $res = $svc->setStatus((int) $id, 'active');
            if (!$res['ok']) {
                Response::error((string) $res['error'], (int) ($res['status'] ?? 422));
            }
            $row = $res['data'];
            $activity->log($r, 'activate', 'lab-experiments', (int) $row['id'], (string) $row['name']);
            Response::json(['data' => $row]);
        }, $protected);

        $router->post("$base/{id}/disable", function (Request $r, string $id) use ($svc, $require, $activity) {
            $require($r, 'lab.publish');
            $res = $svc->setStatus((int) $id, 'disabled');
            if (!$res['ok']) {
                Response::error((string) $res['error'], (int) ($res['status'] ?? 422));
            }
            $row = $res['data'];
            $activity->log($r, 'disable', 'lab-experiments', (int) $row['id'], (string) $row['name']);
            Response::json(['data' => $row]);
        }, $protected);

        $router->post("$base/{id}/archive", function (Request $r, string $id) use ($svc, $require, $activity) {
            $require($r, 'lab.publish');
            $res = $svc->setStatus((int) $id, 'archived');
            if (!$res['ok']) {
                Response::error((string) $res['error'], (int) ($res['status'] ?? 422));
            }
            $row = $res['data'];
            $activity->log($r, 'archive', 'lab-experiments', (int) $row['id'], (string) $row['name']);
            Response::json(['data' => $row]);
        }, $protected);

        $router->post("$base/{id}/duplicate", function (Request $r, string $id) use ($svc, $require, $activity) {
            $require($r, 'lab.create');
            $res = $svc->duplicate((int) $id);
            if (!$res['ok']) {
                Response::error((string) $res['error'], (int) ($res['status'] ?? 422));
            }
            $row = $res['data'];
            $activity->log($r, 'duplicate', 'lab-experiments', (int) $row['id'], (string) $row['name']);
            Response::json(['data' => $row], 201);
        }, $protected);

        $router->post("$base/{id}/reset-content", function (Request $r, string $id) use ($svc, $require, $activity) {
            $require($r, 'lab.update');
            $res = $svc->resetContent((int) $id);
            if (!$res['ok']) {
                Response::error((string) $res['error'], (int) ($res['status'] ?? 422));
            }
            $row = $res['data'];
            $activity->log($r, 'reset-content', 'lab-experiments', (int) $row['id'], (string) $row['name']);
            Response::json(['data' => $row]);
        }, $protected);

        $router->get("$base/{id}/preview", function (Request $r, string $id) use ($svc, $require) {
            $require($r, 'lab.preview');
            $row = $svc->find((int) $id);
            if (!$row) {
                Response::error('Not found', 404);
            }
            if (!LabEntryRegistry::isKnown((string) $row['entry_key'])) {
                Response::error('Unknown experiment entry', 422, ['code' => 'unknown_entry']);
            }
            $row['preview'] = true;
            Response::json(['data' => $row]);
        }, $protected);
    }

    private function staffCanPreview(Request $r, PermissionService $perms, array $app): bool
    {
        $token = $r->bearer() ?: AuthCookie::token();
        if (!$token) {
            return false;
        }

        $mcpToken = (string) ($app['mcp_api_token'] ?? '');
        if ($mcpToken !== '' && hash_equals($mcpToken, $token)) {
            return true;
        }

        try {
            $payload = Jwt::decode($token, (string) ($app['jwt_secret'] ?? ''));
            if (($payload['type'] ?? '') !== 'access') {
                return false;
            }
            $role = (string) ($payload['role'] ?? '');
            if ($role === 'super_admin') {
                return true;
            }
            $user = [
                'sub' => $payload['sub'] ?? null,
                'role' => $role,
                'email' => $payload['email'] ?? null,
            ];
            return $perms->can($user, 'lab.preview') || $perms->can($user, 'lab.view');
        } catch (\Throwable) {
            return false;
        }
    }
}
