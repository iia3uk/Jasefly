<?php
declare(strict_types=1);

namespace App\Modules\Webhooks;

use App\Core\AbstractModule;
use App\Core\Container;
use App\Core\EventDispatcher;
use App\Database;
use App\Middleware\AuthMiddleware;
use App\Middleware\PermissionMiddleware;
use App\Request;
use App\Response;
use App\Router;
use App\Services\ActivityLogService;
use App\Services\PermissionService;

/**
 * Webhooks integration plugin — outbound webhooks on CMS events.
 *
 * Demonstrates the integration pattern: subscribe to kernel events
 * (resource.afterSave, page.afterPublish, etc.) and dispatch HTTP
 * POST callbacks to registered endpoints. Admin UI manages webhook
 * subscriptions.
 */
final class WebhooksModule extends AbstractModule
{
    public function name(): string { return 'webhooks'; }
    public function label(): string { return 'Webhooks'; }
    public function priority(): int { return 60; }

    public function boot(Database $db, array $app): void
    {
        // Subscribe to content events and forward to registered webhooks.
        $events = Container::getInstance()->get(EventDispatcher::class);
        $events->subscribe('resource.afterSave', function (array $payload) use ($db): void {
            $this->dispatch($db, 'resource.afterSave', $payload);
        });
        $events->subscribe('page.afterPublish', function (array $payload) use ($db): void {
            $this->dispatch($db, 'page.afterPublish', $payload);
        });
        $events->subscribe('contact.message', function (array $payload) use ($db): void {
            $this->dispatch($db, 'contact.message', $payload);
        });
    }

    private function dispatch(Database $db, string $event, array $payload): void
    {
        try {
            $hooks = $db->all('SELECT * FROM webhooks WHERE is_active = 1');
        } catch (\Throwable) {
            return;
        }
        foreach ($hooks as $hook) {
            if ($hook['event'] !== '*' && $hook['event'] !== $event) {
                continue;
            }
            $this->post($hook['url'], ['event' => $event, 'payload' => $payload, 'secret' => $hook['secret'] ?? '']);
        }
    }

    private function post(string $url, array $body): void
    {
        $payload = json_encode($body, JSON_UNESCAPED_UNICODE);
        if ($payload === false) {
            return;
        }
        $headers = [];
        $secret = (string) ($body['secret'] ?? '');
        if ($secret !== '') {
            $headers[] = 'X-Jasefly-Signature: sha256=' . hash_hmac('sha256', $payload, $secret);
        }
        \App\Support\OutboundHttp::postJson($url, $payload, $headers);
    }

    public function registerRoutes(Router $router, Database $db, array $app, string $apiPrefix): void
    {
        $p = fn(string $path) => rtrim($apiPrefix, '/') . $path;
        $protected = [new AuthMiddleware($app['jwt_secret']), new PermissionMiddleware(new PermissionService($db))];
        $activity = new ActivityLogService($db);
        // Public webhook endpoints are rate-limited to deter abuse.
        $webhookRate = new \App\Middleware\RateLimitMiddleware($db, 60, 60);

        $base = $p('/admin/webhooks');
        $perms = new PermissionService($db);
        $router->get($base, function () use ($db) {
            Response::json(['data' => $db->all('SELECT id, event, url, is_active, created_at FROM webhooks ORDER BY id DESC')]);
        }, $protected);
        $router->post($base, function (Request $r) use ($db, $activity, $perms) {
            $perms->require($r->user ?? [], 'integrations.manage');
            $event = (string) ($r->input('event') ?? '*');
            $url = (string) ($r->input('url') ?? '');
            $secret = (string) ($r->input('secret') ?? '');
            if (!\App\Support\SsrfGuard::isSafeHttpUrl($url)) {
                Response::error('Invalid or blocked URL', 422);
            }
            $db->run('INSERT INTO webhooks (event, url, secret, is_active) VALUES (?, ?, ?, 1)', [$event, $url, $secret]);
            $id = $db->id();
            $activity->log($r, 'create', 'webhooks', $id, $url);
            Response::json(['data' => ['id' => $id]], 201);
        }, $protected);
        $router->put("$base/{id}", function (Request $r, string $id) use ($db, $perms) {
            $perms->require($r->user ?? [], 'integrations.manage');
            $sets = [];
            $params = [];
            foreach (['event', 'url', 'secret'] as $f) {
                $v = $r->input($f);
                if (is_string($v)) {
                    if ($f === 'url' && !\App\Support\SsrfGuard::isSafeHttpUrl($v)) {
                        Response::error('Invalid or blocked URL', 422);
                    }
                    $sets[] = "$f = ?";
                    $params[] = $v;
                }
            }
            $active = $r->input('is_active');
            if ($active !== null) { $sets[] = 'is_active = ?'; $params[] = $active ? 1 : 0; }
            if (!$sets) { Response::error('No fields', 422); }
            $params[] = $id;
            $db->run('UPDATE webhooks SET ' . implode(', ', $sets) . ' WHERE id = ?', $params);
            Response::json(['message' => 'Webhook updated']);
        }, $protected);
        $router->delete("$base/{id}", function (Request $r, string $id) use ($db, $activity, $perms) {
            $perms->require($r->user ?? [], 'integrations.manage');
            $db->run('DELETE FROM webhooks WHERE id = ?', [$id]);
            $activity->log($r, 'delete', 'webhooks', (int) $id, null);
            Response::json(['message' => 'Webhook deleted']);
        }, $protected);

        // Inbound webhook test receiver.
        $router->post($p('/webhooks/test'), function (Request $r) {
            Response::json(['ok' => true, 'received' => $r->all()]);
        }, [$webhookRate]);
    }

    public function adminNav(): array
    {
        return [
            ['group' => 'Интеграции', 'path' => '/admin/webhooks', 'label' => 'Webhooks', 'permission' => 'integrations.manage', 'icon' => 'webhook'],
        ];
    }

    public function settingsSchema(): array
    {
        return [
            ['key' => 'default_timeout', 'label' => 'Таймаут запроса (сек)', 'type' => 'number', 'default' => 10],
            ['key' => 'retry_count', 'label' => 'Число повторов при ошибке', 'type' => 'number', 'default' => 3],
            ['key' => 'signing_secret', 'label' => 'Секрет для подписи исходящих вебхуков', 'type' => 'text', 'default' => ''],
            ['key' => 'verify_ssl', 'label' => 'Проверять SSL сертификат', 'type' => 'checkbox', 'default' => true],
        ];
    }

    public function settings(): array
    {
        return [
            'default_timeout' => 10,
            'retry_count' => 3,
            'signing_secret' => '',
            'verify_ssl' => true,
        ];
    }

    public function blueprints(): array
    {
        return [
            [
                'key' => 'webhooks',
                'table' => 'webhooks',
                'label' => 'Webhooks',
                'group' => 'Интеграции',
                'icon' => 'webhook',
                'columns' => [
                    'event' => ['type' => 'string', 'widget' => 'text', 'required' => true, 'label' => 'Событие', 'help' => '* для всех событий'],
                    'url' => ['type' => 'string', 'widget' => 'url', 'required' => true, 'label' => 'URL'],
                    'secret' => ['type' => 'string', 'widget' => 'text', 'label' => 'Секрет'],
                    'is_active' => ['type' => 'bool', 'widget' => 'toggle', 'default' => true, 'label' => 'Активен'],
                ],
                'permissions' => ['integrations.manage'],
            ],
        ];
    }
}
