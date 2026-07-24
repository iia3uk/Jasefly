<?php
declare(strict_types=1);

namespace App\Modules\Support;

use App\Core\AbstractModule;
use App\Core\Container;
use App\Core\ModuleRegistry;
use App\Database;
use App\Middleware\AuthMiddleware;
use App\Middleware\PermissionMiddleware;
use App\Middleware\RateLimitMiddleware;
use App\Middleware\SoftRateLimitMiddleware;
use App\Request;
use App\Response;
use App\Router;
use App\Services\PermissionService;

/**
 * Support tickets / live chat — public widget + admin inbox.
 * Agent replies only in CMS; messengers = notifications.
 */
final class SupportModule extends AbstractModule
{
    public function name(): string
    {
        return 'support';
    }

    public function label(): string
    {
        return 'Поддержка';
    }

    public function priority(): int
    {
        return 55;
    }

    public function boot(Database $db, array $app): void
    {
        // Schema via migrations; soft-check so missing tables don't break boot.
        try {
            $db->one('SELECT 1 FROM support_tickets LIMIT 1');
        } catch (\Throwable) {
        }
    }

    public function settingsSchema(): array
    {
        return [
            ['key' => '_h_widget', 'label' => 'Виджет на сайте', 'type' => 'heading'],
            ['key' => 'widget_enabled', 'label' => 'Показывать виджет чата', 'type' => 'checkbox', 'default' => true],
            ['key' => 'widget_title', 'label' => 'Заголовок виджета', 'type' => 'text', 'default' => 'Поддержка'],
            ['key' => 'greeting', 'label' => 'Приветствие', 'type' => 'textarea', 'default' => 'Здравствуйте! Чем можем помочь?'],
            [
                'key' => 'position',
                'label' => 'Позиция',
                'type' => 'select',
                'default' => 'bottom-left',
                'options' => [
                    ['value' => 'bottom-left', 'label' => 'Слева внизу'],
                    ['value' => 'bottom-right', 'label' => 'Справа внизу'],
                ],
            ],
            [
                'key' => 'poll_interval_ms',
                'label' => 'Интервал опроса (мс)',
                'type' => 'number',
                'default' => 3500,
                'help' => '3–4 сек на shared hosting; слишком низко → 429',
            ],
            ['key' => 'require_contact_on_leave', 'label' => 'Требовать контакт при уходе', 'type' => 'checkbox', 'default' => true],
            ['key' => 'social_types', 'label' => 'Типы соцсетей (через запятую)', 'type' => 'text', 'default' => 'telegram,vk,whatsapp,max'],
            ['key' => 'bot_fallback', 'label' => 'Ответ бота, если FAQ не найден', 'type' => 'textarea',
                'default' => 'Сейчас нет операторов онлайн. Оставьте email или соцсеть — ответим позже.'],
            ['key' => 'disposable_domains', 'label' => 'Доп. disposable-домены', 'type' => 'textarea', 'default' => '',
                'help' => 'Через запятую или с новой строки'],

            ['key' => '_h_notify', 'label' => 'Уведомления агентам (соцсети / почта)', 'type' => 'heading',
                'help' => 'Оповещения в общий чат TG/Discord/Max/email — любой саппорт с правом support.agent открывает ссылку в inbox и отвечает. Ответы из мессенджера в v1 нет.'],
            ['key' => 'notify_email', 'label' => 'Email-уведомления', 'type' => 'checkbox', 'default' => true],
            ['key' => 'notify_email_to', 'label' => 'Email получателя (пусто = из Почты)', 'type' => 'text', 'default' => ''],
            ['key' => 'notify_telegram', 'label' => 'Telegram', 'type' => 'checkbox', 'default' => true,
                'help' => 'Если выкл, но в «Почте» уже есть bot/chat — всё равно отправим (fallback).'],
            ['key' => 'telegram_bot_token', 'label' => 'Telegram bot token (пусто = из Почты)', 'type' => 'password', 'default' => ''],
            ['key' => 'telegram_chat_id', 'label' => 'Telegram chat id', 'type' => 'text', 'default' => ''],
            ['key' => 'notify_discord', 'label' => 'Discord webhook', 'type' => 'checkbox', 'default' => false],
            ['key' => 'discord_webhook_url', 'label' => 'Discord webhook URL', 'type' => 'text', 'default' => ''],
            ['key' => 'notify_max', 'label' => 'Max messenger', 'type' => 'checkbox', 'default' => false],
            ['key' => 'max_api_url', 'label' => 'Max bot API URL', 'type' => 'text', 'default' => ''],
            ['key' => 'max_bot_token', 'label' => 'Max bot token', 'type' => 'password', 'default' => ''],
            ['key' => 'max_chat_id', 'label' => 'Max chat id', 'type' => 'text', 'default' => ''],
        ];
    }

    public function settings(): array
    {
        $out = [];
        foreach ($this->settingsSchema() as $f) {
            if (($f['type'] ?? '') === 'heading') {
                continue;
            }
            $out[$f['key']] = $f['default'] ?? '';
        }
        return $out;
    }

    public function adminNav(): array
    {
        return [
            [
                'group' => 'Коммуникации',
                'path' => '/admin/support',
                'label' => 'Поддержка',
                'permission' => 'support.agent',
                'icon' => 'message-circle',
            ],
            [
                'group' => 'Коммуникации',
                'path' => '/admin/support/faq',
                'label' => 'FAQ бота',
                'permission' => 'support.manage',
                'icon' => 'help-circle',
            ],
        ];
    }

    public function registerRoutes(Router $router, Database $db, array $app, string $apiPrefix): void
    {
        $p = fn(string $path) => rtrim($apiPrefix, '/') . $path;
        $perms = new PermissionService($db);
        $protected = [new AuthMiddleware($app['jwt_secret']), new PermissionMiddleware($perms)];
        // Poll GET: soft limit (HTTP 200 + throttled) — hard 429 floods the console.
        $pollRate = new SoftRateLimitMiddleware($db, 180, 60, [
            'throttled' => true,
            'messages' => [],
            'ticket' => null,
            'agents_online' => null,
        ]);
        $writeRate = new RateLimitMiddleware($db, 40, 60);
        $storage = (string) ($app['storage'] ?? dirname(__DIR__, 3) . '/storage');
        $siteUrl = $this->resolveSiteUrl($db, $app);

        $svc = fn(): SupportService => $this->makeService($db, $storage, $siteUrl);

        // —— Public ——
        $router->get($p('/support/config'), function () use ($svc) {
            Response::json(['data' => $svc()->publicConfig()]);
        });

        $router->get($p('/support/faq'), function () use ($svc) {
            Response::json(['data' => $svc()->publicFaqQuestions()]);
        }, [$pollRate]);

        $router->post($p('/support/faq/{id}/ask'), function (Request $r, string $id) use ($svc) {
            $key = (string) ($r->input('visitor_key') ?? '');
            $pageUrl = $r->input('page_url');
            $ua = $r->header('User-Agent') ?? ($r->input('user_agent'));
            $res = $svc()->askFaq(
                (int) $id,
                $key,
                is_string($pageUrl) ? $pageUrl : null,
                is_string($ua) ? $ua : null
            );
            if (!$res['ok']) {
                $code = ($res['code'] ?? '') === 'contact_required' ? 409 : 422;
                Response::json([
                    'success' => false,
                    'error' => $res['error'] ?? 'Ошибка',
                    'code' => $res['code'] ?? null,
                ], $code);
            }
            Response::json(['data' => [
                'ticket' => $res['ticket'],
                'messages' => $res['messages'] ?? [],
            ]], 201);
        }, [$writeRate]);

        $router->post($p('/support/session'), function (Request $r) use ($svc) {
            $existing = trim((string) ($r->input('visitor_key') ?? ($_COOKIE['jasefly_support_vk'] ?? '')));
            $existing = preg_replace('/[^a-f0-9]/i', '', $existing) ?? '';
            $key = (strlen($existing) >= 32) ? substr($existing, 0, 64) : $svc()->newVisitorKey();
            // Persist visitor hash in cookie (1 year) so reload keeps the same chat.
            @setcookie('jasefly_support_vk', $key, [
                'expires' => time() + 86400 * 365,
                'path' => '/',
                'secure' => (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off'),
                'httponly' => false,
                'samesite' => 'Lax',
            ]);
            Response::json(['data' => ['visitor_key' => $key]], 201);
        }, [$writeRate]);

        $router->get($p('/support/active'), function (Request $r) use ($svc, $db) {
            $key = (string) ($r->query('visitor_key') ?? ($_COOKIE['jasefly_support_vk'] ?? ''));
            $pack = $svc()->activeForVisitor($key);
            if (!$pack) {
                Response::json(['data' => null]);
            }
            Response::json([
                'data' => [
                    'ticket' => $pack['ticket'],
                    'messages' => $pack['messages'],
                    'agents_online' => (new SupportPresence($db))->hasOnlineAgents(),
                ],
            ]);
        }, [$pollRate]);

        $router->post($p('/support/tickets'), function (Request $r) use ($svc) {
            $key = (string) ($r->input('visitor_key') ?? '');
            $body = (string) ($r->input('body') ?? $r->input('message') ?? '');
            $pageUrl = $r->input('page_url');
            $ua = $r->header('User-Agent') ?? ($r->input('user_agent'));
            $res = $svc()->createTicket(
                $key,
                $body,
                is_string($pageUrl) ? $pageUrl : null,
                is_string($ua) ? $ua : null
            );
            if (!$res['ok']) {
                Response::error($res['error'] ?? 'Ошибка', 422);
            }
            Response::json(['data' => [
                'ticket' => $res['ticket'],
                'messages' => $res['messages'] ?? [],
            ]], 201);
        }, [$writeRate]);

        $router->get($p('/support/tickets/{publicId}'), function (Request $r, string $publicId) use ($svc) {
            $key = (string) ($r->query('visitor_key') ?? $r->input('visitor_key') ?? '');
            $ticket = $svc()->getByPublicId($publicId, $key);
            if (!$ticket) {
                Response::error('Not found', 404);
            }
            Response::json(['data' => $ticket]);
        }, [$pollRate]);

        $router->get($p('/support/tickets/{publicId}/messages'), function (Request $r, string $publicId) use ($svc, $db) {
            $key = (string) ($r->query('visitor_key') ?? '');
            $after = (int) ($r->query('after_id') ?? 0);
            $ticket = $svc()->getByPublicId($publicId, $key);
            if (!$ticket) {
                Response::error('Not found', 404);
            }
            $svc()->visitorHeartbeat($publicId, $key);
            Response::json([
                'data' => [
                    'ticket' => $svc()->getByPublicId($publicId, $key),
                    'messages' => $svc()->listMessages((int) $ticket['id'], $after),
                    'agents_online' => (new SupportPresence($db))->hasOnlineAgents(),
                ],
            ]);
        }, [$pollRate]);

        $router->post($p('/support/tickets/{publicId}/messages'), function (Request $r, string $publicId) use ($svc) {
            $key = (string) ($r->input('visitor_key') ?? '');
            $body = (string) ($r->input('body') ?? $r->input('message') ?? '');
            $res = $svc()->postVisitorMessage($publicId, $key, $body);
            if (!$res['ok']) {
                $code = ($res['code'] ?? '') === 'contact_required' ? 409 : 422;
                Response::json([
                    'success' => false,
                    'error' => $res['error'] ?? 'Ошибка',
                    'code' => $res['code'] ?? null,
                ], $code);
            }
            Response::json(['data' => [
                'message' => $res['message'],
                'bot_message' => $res['bot_message'] ?? null,
                'ticket' => $res['ticket'] ?? null,
            ]], 201);
        }, [$writeRate]);

        $router->post($p('/support/tickets/{publicId}/contact'), function (Request $r, string $publicId) use ($svc) {
            $key = (string) ($r->input('visitor_key') ?? '');
            $email = $r->input('email');
            $social = $r->input('social') ?? $r->input('contact_social');
            $socialType = $r->input('social_type') ?? $r->input('contact_social_type');
            $res = $svc()->setContact(
                $publicId,
                $key,
                is_string($email) ? $email : null,
                is_string($social) ? $social : null,
                is_string($socialType) ? $socialType : null
            );
            if (!$res['ok']) {
                Response::error($res['error'] ?? 'Ошибка', 422);
            }
            Response::json(['data' => $res['ticket']]);
        }, [$writeRate]);

        $router->post($p('/support/heartbeat'), function (Request $r) use ($svc) {
            $publicId = (string) ($r->input('public_id') ?? '');
            $key = (string) ($r->input('visitor_key') ?? '');
            $leaving = (bool) ($r->input('leaving') ?? false);
            if ($publicId === '' || $key === '') {
                Response::error('public_id and visitor_key required', 422);
            }
            if ($leaving && !empty($this->resolvedSettings()['require_contact_on_leave'])) {
                $ticket = $svc()->markAwaitingContact($publicId, $key);
            } else {
                $ticket = $svc()->visitorHeartbeat($publicId, $key);
            }
            if (!$ticket) {
                Response::error('Not found', 404);
            }
            Response::json(['data' => $ticket]);
        }, [$pollRate]);

        // —— Admin ——
        $requireAgent = function (Request $r) use ($perms): void {
            $user = $r->user ?? null;
            if (!$user || (!$perms->can($user, 'support.agent') && !$perms->can($user, 'support.manage'))) {
                Response::error('Forbidden: support.agent required', 403);
            }
        };
        $requireManage = function (Request $r) use ($perms): void {
            $user = $r->user ?? null;
            if (!$user || !$perms->can($user, 'support.manage')) {
                Response::error('Forbidden: support.manage required', 403);
            }
        };

        $router->post($p('/admin/support/presence'), function (Request $r) use ($db, $requireAgent) {
            $requireAgent($r);
            $uid = (int) ($r->user['sub'] ?? 0);
            (new SupportPresence($db))->touchAgent($uid);
            Response::json([
                'data' => [
                    'ok' => true,
                    'agents_online' => (new SupportPresence($db))->hasOnlineAgents(),
                    'online' => (new SupportPresence($db))->onlineAgents(),
                ],
            ]);
        }, $protected);

        $router->post($p('/admin/support/test-telegram'), function (Request $r) use ($db, $storage, $siteUrl, $requireManage) {
            $requireManage($r);
            $notifier = new SupportNotifier(
                $this->resolvedSettings(),
                $this->mailSettings(),
                $storage . '/logs',
                $this->inboxUrl($db, $siteUrl)
            );
            $res = $notifier->testTelegram();
            if (!$res['ok']) {
                Response::error($res['error'] ?? 'Не удалось отправить', 422);
            }
            Response::json(['success' => true, 'data' => ['message' => 'Тестовое сообщение отправлено в Telegram']]);
        }, $protected);

        $router->get($p('/admin/support/tickets'), function (Request $r) use ($svc, $requireAgent) {
            $requireAgent($r);
            $status = $r->query('status');
            $limit = (int) ($r->query('limit') ?? 50);
            $offset = (int) ($r->query('offset') ?? 0);
            Response::json([
                'data' => $svc()->adminList(is_string($status) ? $status : null, $limit, $offset),
            ]);
        }, $protected);

        $router->get($p('/admin/support/tickets/{id}'), function (Request $r, string $id) use ($svc, $requireAgent) {
            $requireAgent($r);
            $ticket = $svc()->getById((int) $id);
            if (!$ticket) {
                Response::error('Not found', 404);
            }
            Response::json([
                'data' => [
                    'ticket' => $ticket,
                    'messages' => $svc()->listMessages((int) $id, 0),
                ],
            ]);
        }, $protected);

        $router->post($p('/admin/support/tickets/{id}/messages'), function (Request $r, string $id) use ($svc, $requireAgent) {
            $requireAgent($r);
            $uid = (int) ($r->user['sub'] ?? 0);
            $body = (string) ($r->input('body') ?? $r->input('message') ?? '');
            $res = $svc()->agentReply((int) $id, $uid, $body);
            if (!$res['ok']) {
                Response::error($res['error'] ?? 'Ошибка', 422);
            }
            Response::json(['data' => $res['message']], 201);
        }, $protected);

        $router->post($p('/admin/support/tickets/{id}/assign'), function (Request $r, string $id) use ($svc, $requireAgent) {
            $requireAgent($r);
            $uid = (int) ($r->input('user_id') ?? $r->user['sub'] ?? 0);
            $svc()->assign((int) $id, $uid);
            Response::json(['data' => $svc()->getById((int) $id)]);
        }, $protected);

        $router->post($p('/admin/support/tickets/{id}/close'), function (Request $r, string $id) use ($svc, $requireAgent) {
            $requireAgent($r);
            $svc()->close((int) $id);
            Response::json(['data' => $svc()->getById((int) $id)]);
        }, $protected);

        $router->get($p('/admin/support/faq'), function (Request $r) use ($svc, $requireManage) {
            $requireManage($r);
            Response::json(['data' => $svc()->listFaq(false)]);
        }, $protected);

        $router->post($p('/admin/support/faq'), function (Request $r) use ($svc, $requireManage) {
            $requireManage($r);
            $res = $svc()->createFaq(
                (string) ($r->input('question') ?? ''),
                (string) ($r->input('answer') ?? ''),
                (string) ($r->input('keywords') ?? ''),
                (int) ($r->input('sort_order') ?? 0)
            );
            if (!$res['ok']) {
                Response::error($res['error'] ?? 'Ошибка', 422);
            }
            Response::json(['data' => $res['item']], 201);
        }, $protected);

        $router->put($p('/admin/support/faq/{id}'), function (Request $r, string $id) use ($svc, $requireManage) {
            $requireManage($r);
            $res = $svc()->updateFaq((int) $id, $r->all());
            if (!$res['ok']) {
                Response::error($res['error'] ?? 'Ошибка', 422);
            }
            Response::json(['message' => 'OK']);
        }, $protected);

        $router->delete($p('/admin/support/faq/{id}'), function (Request $r, string $id) use ($svc, $requireManage, $perms) {
            $requireManage($r);
            // DELETE middleware may require content.delete — admin has it.
            if (!$perms->can($r->user ?? [], 'support.manage')) {
                Response::error('Forbidden', 403);
            }
            $svc()->deleteFaq((int) $id);
            Response::json(['message' => 'Deleted']);
        }, $protected);
    }

    private function makeService(Database $db, string $storage, string $siteUrl): SupportService
    {
        $settings = $this->resolvedSettings();
        $mailSettings = $this->mailSettings();
        $presence = new SupportPresence($db);
        $bot = new SupportBot($db, (string) ($settings['bot_fallback'] ?? ''));
        $guard = new SupportEmailGuard();
        $inbox = $this->inboxUrl($db, $siteUrl);
        $notifier = new SupportNotifier($settings, $mailSettings, $storage . '/logs', $inbox);
        return new SupportService($db, $settings, $presence, $bot, $guard, $notifier);
    }

    /** Absolute site origin for links in messenger notifications. */
    private function resolveSiteUrl(Database $db, array $app): string
    {
        $candidates = [
            (string) ($app['url'] ?? ''),
            (string) ($app['public_url'] ?? ''),
            (string) ($app['app_url'] ?? ''),
        ];
        try {
            $seo = $db->one('SELECT canonical_base_url FROM seo_settings LIMIT 1');
            if (is_array($seo)) {
                array_unshift($candidates, (string) ($seo['canonical_base_url'] ?? ''));
            }
        } catch (\Throwable) {
        }
        foreach ($candidates as $c) {
            $c = rtrim(trim($c), '/');
            if ($c !== '' && preg_match('#^https?://#i', $c)) {
                return $c;
            }
        }
        $https = !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off';
        $host = (string) ($_SERVER['HTTP_HOST'] ?? '');
        if ($host !== '') {
            return ($https ? 'https://' : 'http://') . $host;
        }
        return '';
    }

    private function inboxUrl(Database $db, string $siteUrl): string
    {
        $base = '/admin';
        try {
            $row = $db->one('SELECT admin_base_path FROM site_settings LIMIT 1');
            $custom = trim((string) ($row['admin_base_path'] ?? ''), '/');
            if ($custom !== '') {
                $base = '/' . $custom;
            }
        } catch (\Throwable) {
        }
        $path = rtrim($base, '/') . '/support';
        return ($siteUrl !== '' ? $siteUrl : '') . $path;
    }

    /** @return array<string, mixed> */
    private function resolvedSettings(): array
    {
        try {
            /** @var ModuleRegistry $reg */
            $reg = Container::getInstance()->get(ModuleRegistry::class);
            $module = $reg->get('support');
            if ($module) {
                return $reg->state()->getSettings($module);
            }
        } catch (\Throwable) {
        }
        return $this->settings();
    }

    /** @return array<string, mixed> */
    private function mailSettings(): array
    {
        try {
            /** @var ModuleRegistry $reg */
            $reg = Container::getInstance()->get(ModuleRegistry::class);
            $module = $reg->get('mail');
            if ($module) {
                return $reg->state()->getSettings($module);
            }
        } catch (\Throwable) {
        }
        return [];
    }
}
