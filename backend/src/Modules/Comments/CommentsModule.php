<?php
declare(strict_types=1);

namespace App\Modules\Comments;

use App\Core\AbstractModule;
use App\Database;
use App\Middleware\AuthMiddleware;
use App\Middleware\PermissionMiddleware;
use App\Middleware\RateLimitMiddleware;
use App\Request;
use App\Response;
use App\Router;
use App\Services\PermissionService;

final class CommentsModule extends AbstractModule
{
    public function name(): string { return 'comments'; }
    public function label(): string { return 'Комментарии и отзывы'; }
    public function priority(): int { return 54; }

    public function adminNav(): array
    {
        return [['group' => 'Коммуникации', 'path' => '/admin/comments', 'label' => 'Модерация', 'permission' => 'comments.view', 'icon' => 'message-square']];
    }

    public function blocks(): array
    {
        return [
            ['type' => 'comments', 'label' => 'Комментарии', 'category' => 'content'],
            ['type' => 'reviews', 'label' => 'Отзывы', 'category' => 'content'],
            ['type' => 'rating-summary', 'label' => 'Рейтинг', 'category' => 'content'],
            ['type' => 'review-form', 'label' => 'Форма отзыва', 'category' => 'content'],
        ];
    }

    public function registerRoutes(Router $router, Database $db, array $app, string $apiPrefix): void
    {
        $p = fn(string $path): string => rtrim($apiPrefix, '/') . $path;
        $svc = new CommentsService($db, (string) $app['jwt_secret']);
        $rate = new RateLimitMiddleware($db, 10, 60);
        $perms = new PermissionService($db);
        $protected = [new AuthMiddleware($app['jwt_secret']), new PermissionMiddleware($perms)];

        $router->get($p('/comments'), function (Request $r) use ($svc) {
            try {
                $targetType = (string) ($r->query('target_type') ?? '');
                $targetId = (int) ($r->query('target_id') ?? 0);
                Response::json(['data' => [
                    'items' => $svc->approved($targetType, $targetId, is_string($r->query('type')) ? $r->query('type') : null),
                    'rating' => $svc->ratingSummary($targetType, $targetId),
                ]]);
            } catch (\InvalidArgumentException $e) { Response::error($e->getMessage(), 422); }
        });
        $router->post($p('/comments'), function (Request $r) use ($svc) {
            try {
                Response::json(['data' => $svc->create($r->all(), $r->ip())], 201);
            } catch (\InvalidArgumentException $e) { Response::error($e->getMessage(), 422); }
        }, [$rate]);

        $router->get($p('/admin/comments'), function (Request $r) use ($db, $perms) {
            $perms->require($r->user, 'comments.view');
            $status = (string) ($r->query('status') ?? 'pending');
            $type = (string) ($r->query('type') ?? '');
            $sql = 'SELECT * FROM comments WHERE deleted_at IS NULL';
            $params = [];
            if ($status !== '') { $sql .= ' AND status=?'; $params[] = $status; }
            if (in_array($type, ['comment','review'], true)) { $sql .= ' AND type=?'; $params[] = $type; }
            $sql .= ' ORDER BY id DESC LIMIT 300';
            Response::json(['data' => $db->all($sql, $params)]);
        }, $protected);
        $router->post($p('/admin/comments/{id}/moderate'), function (Request $r, string $id) use ($svc, $perms) {
            $perms->require($r->user, 'comments.moderate');
            try {
                Response::json(['data' => $svc->moderate((int) $id, (string) ($r->input('status') ?? ''))]);
            } catch (\InvalidArgumentException $e) { Response::error($e->getMessage(), 422); }
        }, $protected);
        $router->delete($p('/admin/comments/{id}'), function (Request $r, string $id) use ($db, $perms) {
            $perms->require($r->user, 'comments.manage');
            $db->run("UPDATE comments SET status='deleted',deleted_at=NOW() WHERE id=?", [(int) $id]);
            Response::json(['data' => ['ok' => true]]);
        }, $protected);
    }
}
