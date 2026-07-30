<?php
declare(strict_types=1);

namespace App\Modules\Notifications;

use App\Core\AbstractModule;
use App\Database;
use App\Middleware\AuthMiddleware;
use App\Middleware\PermissionMiddleware;
use App\Request;
use App\Response;
use App\Router;
use App\Services\PermissionService;

final class NotificationsModule extends AbstractModule
{
    public function name(): string { return 'notifications'; }
    public function label(): string { return 'Уведомления'; }
    public function priority(): int { return 17; }
    public function enabled(array $app): bool { return false; }
    public function adminNav(): array
    {
        return [[
            'group' => 'Коммуникации', 'path' => '/admin/notifications', 'label' => 'Уведомления',
            'permission' => 'notifications.view', 'icon' => 'bell',
        ]];
    }

    public function registerRoutes(Router $router, Database $db, array $app, string $apiPrefix): void
    {
        $p = fn(string $path) => rtrim($apiPrefix, '/') . $path;
        $perms = new PermissionService($db);
        $protected = [new AuthMiddleware($app['jwt_secret']), new PermissionMiddleware($perms)];
        $uid = static fn(Request $r): int => (int) ($r->user['sub'] ?? $r->user['id'] ?? 0);

        $router->get($p('/admin/notifications'), function (Request $r) use ($db, $perms, $uid) {
            $perms->require($r->user, 'notifications.view');
            $onlyUnread = (string) ($r->query('unread') ?? '') === '1';
            $sql = 'SELECT * FROM notifications WHERE (user_id=? OR user_id IS NULL)';
            if ($onlyUnread) $sql .= ' AND is_read=0';
            $sql .= ' ORDER BY id DESC LIMIT 200';
            Response::json(['data' => $db->all($sql, [$uid($r)])]);
        }, $protected);
        $router->get($p('/admin/notifications/unread-count'), function (Request $r) use ($db, $perms, $uid) {
            $perms->require($r->user, 'notifications.view');
            $row = $db->one(
                'SELECT COUNT(*) c FROM notifications WHERE is_read=0 AND (user_id=? OR user_id IS NULL)', [$uid($r)]
            );
            Response::json(['data' => ['count' => (int) ($row['c'] ?? 0)]]);
        }, $protected);
        $router->post($p('/admin/notifications/{id}/read'), function (Request $r, string $id) use ($perms, $uid, $db) {
            $perms->require($r->user, 'notifications.view');
            $ok = (new NotificationService($db))->markRead((int) $id, $uid($r));
            if (!$ok) Response::error('Not found', 404);
            Response::json(['data' => ['ok' => true]]);
        }, $protected);
        $router->post($p('/admin/notifications/read-all'), function (Request $r) use ($perms, $uid, $db) {
            $perms->require($r->user, 'notifications.view');
            Response::json(['data' => ['count' => (new NotificationService($db))->markAllRead($uid($r))]]);
        }, $protected);

        // Manual smoke-test so admins can verify inbox + channels without waiting for a form.
        $router->post($p('/admin/notifications/test'), function (Request $r) use ($perms, $db) {
            $perms->require($r->user, 'notifications.manage');
            $title = trim((string) ($r->input('title') ?? 'Тестовое уведомление'));
            $body = trim((string) ($r->input('body') ?? 'Если вы это видите — канал «Уведомления» работает. Дальше настройте Автоматизацию или действие формы create_notification.'));
            if ($title === '') {
                $title = 'Тестовое уведомление';
            }
            $id = (new NotificationService($db))->notifyAdmins(
                'system.test',
                $title,
                $body !== '' ? $body : 'Канал уведомлений работает.',
                ['action_url' => '/admin/notifications', 'priority' => 'normal']
            );
            Response::json(['data' => ['id' => $id, 'ok' => true]]);
        }, $protected);

        $router->get($p('/admin/notification-templates'), function (Request $r) use ($db, $perms) {
            $perms->require($r->user, 'notifications.manage');
            Response::json(['data' => $db->all('SELECT * FROM notification_templates ORDER BY id DESC')]);
        }, $protected);
        $router->post($p('/admin/notification-templates'), function (Request $r) use ($db, $perms) {
            $perms->require($r->user, 'notifications.manage');
            $db->run(
                'INSERT INTO notification_templates (type,channel,subject,body,is_active) VALUES (?,?,?,?,?)',
                [(string) $r->input('type'), (string) ($r->input('channel') ?? 'browser'),
                    $r->input('subject'), (string) $r->input('body'), (int) (bool) ($r->input('is_active') ?? true)]
            );
            Response::json(['data' => ['id' => (int) $db->id()]], 201);
        }, $protected);
        $router->put($p('/admin/notification-templates/{id}'), function (Request $r, string $id) use ($db, $perms) {
            $perms->require($r->user, 'notifications.manage');
            $db->run(
                'UPDATE notification_templates SET type=?,channel=?,subject=?,body=?,is_active=? WHERE id=?',
                [(string) $r->input('type'), (string) ($r->input('channel') ?? 'browser'), $r->input('subject'),
                    (string) $r->input('body'), (int) (bool) ($r->input('is_active') ?? true), (int) $id]
            );
            Response::json(['data' => ['ok' => true]]);
        }, $protected);
        $router->delete($p('/admin/notification-templates/{id}'), function (Request $r, string $id) use ($db, $perms) {
            $perms->require($r->user, 'notifications.manage');
            $db->run('DELETE FROM notification_templates WHERE id=?', [(int) $id]);
            Response::json(['data' => ['ok' => true]]);
        }, $protected);
    }
}
