<?php
declare(strict_types=1);

namespace App\PackageModules\Notifications;

use App\Platform\Contracts\PlatformRequestInterface;
use App\Platform\Package\AbstractPackageModule;
use App\Platform\Package\PlatformResponse;
use App\Platform\PlatformContext;

/**
 * Notifications — installable package providing notifications.send.
 */
final class NotificationsModule extends AbstractPackageModule
{
    public function name(): string
    {
        return 'notifications';
    }

    public function label(): string
    {
        return 'Уведомления';
    }

    public function priority(): int
    {
        return 17;
    }

    public function adminNav(): array
    {
        return [[
            'group' => 'Коммуникации',
            'path' => '/admin/notifications',
            'label' => 'Уведомления',
            'permission' => 'notifications.view',
            'icon' => 'bell',
        ]];
    }

    public function bootPlatform(PlatformContext $ctx): void
    {
        parent::bootPlatform($ctx);

        foreach (['api.routes', 'admin.pages', 'permissions.check'] as $cap) {
            $ctx->capabilities()->require($cap);
        }

        $db = $ctx->database();
        $http = $ctx->http();
        $perms = $ctx->permissions();
        $mail = $ctx->mail();
        $svc = new NotificationInbox($db, $mail, $http);

        // Generic provider bind — clearOwner on disable (any slug).
        $ctx->notifications()->registerBackend(
            static function (string $type, string $title, string $body = '', array $data = []) use ($svc): void {
                $svc->notifyAdmins($type, $title, $body, $data);
            },
            static function (int $userId, string $type, string $title, string $body = '', array $data = []) use ($svc): void {
                $svc->create($userId, $type, $title, $body, $data);
            },
        );

        $protected = [$http->authMiddleware(), $http->permissionMiddleware()];
        $uid = static fn(PlatformRequestInterface $r): int => (int) (($r->user()['sub'] ?? $r->user()['id'] ?? 0));

        $http->get('/admin/notifications', static function (PlatformRequestInterface $r) use ($db, $perms, $uid) {
            $perms->require($r->user() ?? [], 'notifications.view');
            $onlyUnread = (string) ($r->query()['unread'] ?? '') === '1';
            $sql = 'SELECT * FROM notifications WHERE (user_id=? OR user_id IS NULL)';
            if ($onlyUnread) {
                $sql .= ' AND is_read=0';
            }
            $sql .= ' ORDER BY id DESC LIMIT 200';
            PlatformResponse::json(['data' => $db->all($sql, [$uid($r)])]);
        }, $protected);

        $http->get('/admin/notifications/unread-count', static function (PlatformRequestInterface $r) use ($db, $perms, $uid) {
            $perms->require($r->user() ?? [], 'notifications.view');
            $row = $db->one(
                'SELECT COUNT(*) c FROM notifications WHERE is_read=0 AND (user_id=? OR user_id IS NULL)',
                [$uid($r)]
            );
            PlatformResponse::json(['data' => ['count' => (int) ($row['c'] ?? 0)]]);
        }, $protected);

        $http->post('/admin/notifications/{id}/read', static function (PlatformRequestInterface $r, string $id) use ($perms, $uid, $svc) {
            $perms->require($r->user() ?? [], 'notifications.view');
            $ok = $svc->markRead((int) $id, $uid($r));
            if (!$ok) {
                PlatformResponse::error('Not found', 404);
            }
            PlatformResponse::json(['data' => ['ok' => true]]);
        }, $protected);

        $http->post('/admin/notifications/read-all', static function (PlatformRequestInterface $r) use ($perms, $uid, $svc) {
            $perms->require($r->user() ?? [], 'notifications.view');
            PlatformResponse::json(['data' => ['count' => $svc->markAllRead($uid($r))]]);
        }, $protected);

        $http->post('/admin/notifications/test', static function (PlatformRequestInterface $r) use ($perms, $svc) {
            $perms->require($r->user() ?? [], 'notifications.manage');
            $title = trim((string) ($r->input('title') ?? 'Тестовое уведомление'));
            $body = trim((string) ($r->input('body') ?? 'Если вы это видите — канал «Уведомления» работает.'));
            if ($title === '') {
                $title = 'Тестовое уведомление';
            }
            $id = $svc->notifyAdmins(
                'system.test',
                $title,
                $body !== '' ? $body : 'Канал уведомлений работает.',
                ['action_url' => '/admin/notifications', 'priority' => 'normal']
            );
            PlatformResponse::json(['data' => ['id' => $id, 'ok' => true]]);
        }, $protected);

        $http->get('/admin/notification-templates', static function (PlatformRequestInterface $r) use ($db, $perms) {
            $perms->require($r->user() ?? [], 'notifications.manage');
            PlatformResponse::json(['data' => $db->all('SELECT * FROM notification_templates ORDER BY id DESC')]);
        }, $protected);

        $http->post('/admin/notification-templates', static function (PlatformRequestInterface $r) use ($db, $perms) {
            $perms->require($r->user() ?? [], 'notifications.manage');
            $db->run(
                'INSERT INTO notification_templates (type,channel,subject,body,is_active) VALUES (?,?,?,?,?)',
                [
                    (string) $r->input('type'),
                    (string) ($r->input('channel') ?? 'browser'),
                    $r->input('subject'),
                    (string) $r->input('body'),
                    (int) (bool) ($r->input('is_active') ?? true),
                ]
            );
            PlatformResponse::json(['data' => ['id' => (int) $db->lastInsertId()]], 201);
        }, $protected);

        $http->put('/admin/notification-templates/{id}', static function (PlatformRequestInterface $r, string $id) use ($db, $perms) {
            $perms->require($r->user() ?? [], 'notifications.manage');
            $db->run(
                'UPDATE notification_templates SET type=?,channel=?,subject=?,body=?,is_active=? WHERE id=?',
                [
                    (string) $r->input('type'),
                    (string) ($r->input('channel') ?? 'browser'),
                    $r->input('subject'),
                    (string) $r->input('body'),
                    (int) (bool) ($r->input('is_active') ?? true),
                    (int) $id,
                ]
            );
            PlatformResponse::json(['data' => ['ok' => true]]);
        }, $protected);

        $http->delete('/admin/notification-templates/{id}', static function (PlatformRequestInterface $r, string $id) use ($db, $perms) {
            $perms->require($r->user() ?? [], 'notifications.manage');
            $db->run('DELETE FROM notification_templates WHERE id=?', [(int) $id]);
            PlatformResponse::json(['data' => ['ok' => true]]);
        }, $protected);
    }
}
