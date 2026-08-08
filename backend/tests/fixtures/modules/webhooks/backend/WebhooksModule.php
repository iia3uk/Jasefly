<?php
declare(strict_types=1);

namespace App\PackageModules\Webhooks;

use App\Platform\Contracts\PlatformRequestInterface;
use App\Platform\Package\AbstractPackageModule;
use App\Platform\Package\PlatformResponse;
use App\Platform\PlatformContext;

/**
 * Outbound webhooks — installable package (extracted from bundled Modules/Webhooks).
 */
final class WebhooksModule extends AbstractPackageModule
{
    public function name(): string
    {
        return 'webhooks';
    }

    public function label(): string
    {
        return 'Webhooks';
    }

    public function priority(): int
    {
        return 60;
    }

    public function adminNav(): array
    {
        return [[
            'group' => 'Интеграции',
            'path' => '/admin/webhooks',
            'label' => 'Webhooks',
            'permission' => 'integrations.manage',
            'icon' => 'webhook',
        ]];
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
        return [[
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
        ]];
    }

    public function bootPlatform(PlatformContext $ctx): void
    {
        parent::bootPlatform($ctx);

        $ctx->capabilities()->require('http.client');
        $ctx->capabilities()->require('events.subscribe');

        $http = $ctx->http();
        $db = $ctx->database();
        $perms = $ctx->permissions();
        $logger = $ctx->logger();

        $dispatch = static function (string $event, array $payload) use ($db, $http, $logger): void {
            try {
                $hooks = $db->all('SELECT * FROM webhooks WHERE is_active = 1');
            } catch (\Throwable) {
                return;
            }
            if (!is_array($hooks)) {
                return;
            }
            foreach ($hooks as $hook) {
                if (!is_array($hook)) {
                    continue;
                }
                $hookEvent = (string) ($hook['event'] ?? '*');
                if ($hookEvent !== '*' && $hookEvent !== $event) {
                    continue;
                }
                $url = (string) ($hook['url'] ?? '');
                if ($url === '' || !$http->isSafeOutboundUrl($url)) {
                    continue;
                }
                $secret = (string) ($hook['secret'] ?? '');
                $body = [
                    'event' => $event,
                    'payload' => $payload,
                    'secret' => $secret,
                ];
                $json = json_encode($body, JSON_UNESCAPED_UNICODE);
                if ($json === false) {
                    continue;
                }
                $headers = [];
                if ($secret !== '') {
                    $headers[] = 'X-Jasefly-Signature: sha256=' . hash_hmac('sha256', $json, $secret);
                }
                $ok = $http->postJsonOutbound($url, $json, $headers, 10);
                if (!$ok) {
                    $logger->warning('webhooks.dispatch_failed', [
                        'id' => $hook['id'] ?? null,
                        'event' => $event,
                        'url' => $url,
                    ]);
                }
            }
        };

        $ctx->events()->subscribe('resource.afterSave', static function ($payload) use ($dispatch) {
            if (is_array($payload)) {
                $dispatch('resource.afterSave', $payload);
            }
            return null;
        }, 80);

        $ctx->events()->subscribe('page.afterPublish', static function ($payload) use ($dispatch) {
            if (is_array($payload)) {
                $dispatch('page.afterPublish', $payload);
            }
            return null;
        }, 80);

        $ctx->events()->subscribe('contact.message', static function ($payload) use ($dispatch) {
            if (is_array($payload)) {
                $dispatch('contact.message', $payload);
            }
            return null;
        }, 80);

        $protected = [$http->authMiddleware(), $http->permissionMiddleware()];
        $webhookRate = $http->rateLimitMiddleware(60, 60);

        $http->get('/admin/webhooks', static function (PlatformRequestInterface $r) use ($db, $perms) {
            $perms->require($r->user() ?? [], 'integrations.manage');
            try {
                $rows = $db->all('SELECT id, event, url, is_active, created_at FROM webhooks ORDER BY id DESC');
            } catch (\Throwable) {
                $rows = [];
            }
            PlatformResponse::json(['data' => is_array($rows) ? $rows : []]);
        }, $protected);

        $http->post('/admin/webhooks', static function (PlatformRequestInterface $r) use ($db, $perms, $http) {
            $perms->require($r->user() ?? [], 'integrations.manage');
            $body = $r->body();
            if (!is_array($body)) {
                PlatformResponse::error('Invalid body', 422);
            }
            $event = (string) ($body['event'] ?? '*');
            $url = (string) ($body['url'] ?? '');
            $secret = (string) ($body['secret'] ?? '');
            if (!$http->isSafeOutboundUrl($url)) {
                PlatformResponse::error('Invalid or blocked URL', 422);
            }
            $db->run('INSERT INTO webhooks (event, url, secret, is_active) VALUES (?, ?, ?, 1)', [$event, $url, $secret]);
            $id = (int) $db->lastInsertId();
            PlatformResponse::json(['data' => ['id' => $id]], 201);
        }, $protected);

        $http->put('/admin/webhooks/{id}', static function (PlatformRequestInterface $r, string $id) use ($db, $perms, $http) {
            $perms->require($r->user() ?? [], 'integrations.manage');
            $body = $r->body();
            if (!is_array($body)) {
                PlatformResponse::error('Invalid body', 422);
            }
            $sets = [];
            $params = [];
            foreach (['event', 'url', 'secret'] as $f) {
                if (!array_key_exists($f, $body) || !is_string($body[$f])) {
                    continue;
                }
                if ($f === 'url' && !$http->isSafeOutboundUrl($body[$f])) {
                    PlatformResponse::error('Invalid or blocked URL', 422);
                }
                $sets[] = "{$f} = ?";
                $params[] = $body[$f];
            }
            if (array_key_exists('is_active', $body)) {
                $sets[] = 'is_active = ?';
                $params[] = !empty($body['is_active']) ? 1 : 0;
            }
            if ($sets === []) {
                PlatformResponse::error('No fields', 422);
            }
            $params[] = (int) $id;
            $db->run('UPDATE webhooks SET ' . implode(', ', $sets) . ' WHERE id = ?', $params);
            PlatformResponse::json(['message' => 'Webhook updated']);
        }, $protected);

        $http->delete('/admin/webhooks/{id}', static function (PlatformRequestInterface $r, string $id) use ($db, $perms) {
            $perms->require($r->user() ?? [], 'integrations.manage');
            $db->run('DELETE FROM webhooks WHERE id = ?', [(int) $id]);
            PlatformResponse::json(['message' => 'Webhook deleted']);
        }, $protected);

        $http->post('/webhooks/test', static function (PlatformRequestInterface $r) {
            PlatformResponse::json(['ok' => true, 'received' => $r->body()]);
        }, [$webhookRate]);
    }
}
