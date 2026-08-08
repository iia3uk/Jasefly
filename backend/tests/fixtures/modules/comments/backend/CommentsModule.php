<?php
declare(strict_types=1);

namespace App\PackageModules\Comments;

use App\Platform\Contracts\PlatformRequestInterface;
use App\Platform\Package\AbstractPackageModule;
use App\Platform\Package\PlatformResponse;
use App\Platform\PlatformContext;

/**
 * Comments & reviews — installable package (extracted from bundled Modules/Comments).
 * Owns frozen builder widget IDs: comments, reviews, rating-summary, review-form.
 */
final class CommentsModule extends AbstractPackageModule
{
    public function name(): string
    {
        return 'comments';
    }

    public function label(): string
    {
        return 'Комментарии и отзывы';
    }

    public function priority(): int
    {
        return 54;
    }

    public function adminNav(): array
    {
        return [[
            'group' => 'Коммуникации',
            'path' => '/admin/comments',
            'label' => 'Модерация',
            'permission' => 'comments.view',
            'icon' => 'message-square',
        ]];
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

    public function bootPlatform(PlatformContext $ctx): void
    {
        parent::bootPlatform($ctx);

        $ctx->capabilities()->require('api.routes');
        $ctx->capabilities()->require('events.publish');

        $ctx->events()->declare('comment.created', [
            'label' => 'Новый комментарий',
            'category' => 'comments',
            'payload' => ['comment' => 'object'],
        ]);

        $http = $ctx->http();
        $db = $ctx->database();
        $perms = $ctx->permissions();
        $svc = static fn(): CommentsService => new CommentsService(
            $db,
            $ctx->events(),
            (string) ($ctx->config()->get('jwt_secret') ?? ''),
        );

        $rate = $http->rateLimitMiddleware(10, 60);
        $protected = [$http->authMiddleware(), $http->permissionMiddleware()];

        $http->get('/comments', static function (PlatformRequestInterface $r) use ($svc) {
            try {
                $q = $r->query();
                $targetType = (string) ($q['target_type'] ?? '');
                $targetId = (int) ($q['target_id'] ?? 0);
                $type = isset($q['type']) && is_string($q['type']) ? $q['type'] : null;
                PlatformResponse::json(['data' => [
                    'items' => $svc()->approved($targetType, $targetId, $type),
                    'rating' => $svc()->ratingSummary($targetType, $targetId),
                ]]);
            } catch (\InvalidArgumentException $e) {
                PlatformResponse::error($e->getMessage(), 422);
            }
        });

        $http->post('/comments', static function (PlatformRequestInterface $r) use ($svc) {
            try {
                $body = $r->body();
                if (!is_array($body)) {
                    PlatformResponse::error('Invalid body', 422);
                }
                PlatformResponse::json(['data' => $svc()->create($body, $r->ip())], 201);
            } catch (\InvalidArgumentException $e) {
                PlatformResponse::error($e->getMessage(), 422);
            }
        }, [$rate]);

        $http->get('/admin/comments', static function (PlatformRequestInterface $r) use ($db, $perms) {
            $perms->require($r->user() ?? [], 'comments.view');
            $q = $r->query();
            $status = (string) ($q['status'] ?? 'pending');
            $type = (string) ($q['type'] ?? '');
            $sql = 'SELECT * FROM comments WHERE deleted_at IS NULL';
            $params = [];
            if ($status !== '') {
                $sql .= ' AND status=?';
                $params[] = $status;
            }
            if (in_array($type, ['comment', 'review'], true)) {
                $sql .= ' AND type=?';
                $params[] = $type;
            }
            $sql .= ' ORDER BY id DESC LIMIT 300';
            try {
                $rows = $db->all($sql, $params);
            } catch (\Throwable) {
                $rows = [];
            }
            PlatformResponse::json(['data' => is_array($rows) ? $rows : []]);
        }, $protected);

        $http->post('/admin/comments/{id}/moderate', static function (PlatformRequestInterface $r, string $id) use ($svc, $perms) {
            $perms->require($r->user() ?? [], 'comments.moderate');
            $body = $r->body();
            $status = is_array($body) ? (string) ($body['status'] ?? '') : '';
            try {
                PlatformResponse::json(['data' => $svc()->moderate((int) $id, $status)]);
            } catch (\InvalidArgumentException $e) {
                PlatformResponse::error($e->getMessage(), 422);
            }
        }, $protected);

        $http->delete('/admin/comments/{id}', static function (PlatformRequestInterface $r, string $id) use ($db, $perms) {
            $perms->require($r->user() ?? [], 'comments.manage');
            $db->run("UPDATE comments SET status='deleted',deleted_at=NOW() WHERE id=?", [(int) $id]);
            PlatformResponse::json(['data' => ['ok' => true]]);
        }, $protected);
    }
}
