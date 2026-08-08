<?php
declare(strict_types=1);

namespace App\Modules\Mail;

use App\Core\AbstractModule;
use App\Core\Container;
use App\Core\ModuleRegistry;
use App\Database;
use App\Middleware\AuthMiddleware;
use App\Middleware\PermissionMiddleware;
use App\Middleware\RateLimitMiddleware;
use App\Request;
use App\Response;
use App\Router;
use App\Services\PermissionService;

/**
 * Плагин «Почта»: SMTP-отправка HTML-писем + защищённая форма обратной связи.
 *
 * Цепочка: Nginx → PHP → Captcha → Rate limit → Mailer → SMTP (Mail.ru / Яндекс / …)
 */
final class MailModule extends AbstractModule
{
    public function name(): string
    {
        return 'mail';
    }

    public function label(): string
    {
        return 'Почта';
    }

    public function priority(): int
    {
        return 55;
    }

    public function settingsSchema(): array
    {
        return [
            ['key' => '_heading_smtp', 'label' => 'SMTP', 'type' => 'heading', 'default' => '',
                'help' => 'Mail.ru, Яндекс 360, Mailgun, Brevo и любой SMTP. Функция mail() не используется.'],
            ['key' => 'from_name', 'label' => 'Имя отправителя', 'type' => 'text', 'default' => 'Jasefly'],
            ['key' => 'from_email', 'label' => 'Email отправителя', 'type' => 'text', 'default' => ''],
            ['key' => 'to_email', 'label' => 'Email получателя', 'type' => 'text', 'default' => '',
                'help' => 'Куда приходят сообщения с формы'],
            ['key' => 'smtp_host', 'label' => 'SMTP хост', 'type' => 'text', 'default' => '',
                'help' => 'smtp.mail.ru / smtp.yandex.ru / smtp.gmail.com / …'],
            ['key' => 'smtp_port', 'label' => 'SMTP порт', 'type' => 'number', 'default' => 587],
            ['key' => 'smtp_encryption', 'label' => 'Шифрование', 'type' => 'select', 'default' => 'tls',
                'options' => [
                    ['value' => 'tls', 'label' => 'STARTTLS (обычно 587)'],
                    ['value' => 'ssl', 'label' => 'SSL (обычно 465)'],
                    ['value' => 'none', 'label' => 'Без шифрования'],
                ]],
            ['key' => 'smtp_username', 'label' => 'SMTP логин', 'type' => 'text', 'default' => ''],
            ['key' => 'smtp_password', 'label' => 'SMTP пароль', 'type' => 'password', 'secret' => true, 'default' => ''],
            ['key' => 'success_message', 'label' => 'Сообщение после отправки', 'type' => 'text',
                'default' => 'Спасибо! Сообщение отправлено. Мы ответим вам в ближайшее время.'],

            // Telegram delivery remains coupled to Mail plugin (not extracted) — credentials only.
            ['key' => '_heading_telegram', 'label' => 'Telegram', 'type' => 'heading', 'default' => '',
                'help' => 'Мгновенные уведомления о заявках с формы. Создайте бота у @BotFather и узнайте chat_id.'],
            ['key' => 'telegram_enabled', 'label' => 'Уведомлять в Telegram', 'type' => 'select', 'default' => '0',
                'options' => [
                    ['value' => '0', 'label' => 'Выключено'],
                    ['value' => '1', 'label' => 'Включено'],
                ]],
            ['key' => 'telegram_bot_token', 'label' => 'Bot token', 'type' => 'password', 'secret' => true, 'default' => ''],
            ['key' => 'telegram_chat_id', 'label' => 'Chat ID', 'type' => 'text', 'default' => '',
                'help' => 'Личный chat_id или id группы/канала'],

            ['key' => '_heading_captcha', 'label' => 'Защита от ботов', 'type' => 'heading', 'default' => '',
                'help' => 'Опционально: Cloudflare Turnstile или Яндекс SmartCaptcha перед SMTP.'],
            ['key' => 'captcha_provider', 'label' => 'Капча', 'type' => 'select', 'default' => 'none',
                'options' => [
                    ['value' => 'none', 'label' => 'Выключена (CSRF + honeypot + rate limit)'],
                    ['value' => 'turnstile', 'label' => 'Cloudflare Turnstile'],
                    ['value' => 'smartcaptcha', 'label' => 'Яндекс SmartCaptcha'],
                ]],
            ['key' => 'turnstile_site_key', 'label' => 'Turnstile site key', 'type' => 'text', 'default' => ''],
            ['key' => 'turnstile_secret', 'label' => 'Turnstile secret key', 'type' => 'password', 'secret' => true, 'default' => ''],
            ['key' => 'smartcaptcha_site_key', 'label' => 'SmartCaptcha client key', 'type' => 'text', 'default' => ''],
            ['key' => 'smartcaptcha_secret', 'label' => 'SmartCaptcha server key', 'type' => 'password', 'secret' => true, 'default' => ''],
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

    public function blocks(): array
    {
        return [
            ['type' => 'contact-form', 'label' => 'Форма обратной связи', 'category' => 'mail'],
        ];
    }

    public function demoPages(): array
    {
        return [
            [
                'slug' => 'contact',
                'title' => 'Контакты',
                'status' => 'published',
            ],
        ];
    }

    public function registerRoutes(Router $router, Database $db, array $app, string $apiPrefix): void
    {
        $p = fn(string $path) => rtrim($apiPrefix, '/') . $path;
        $protected = [new AuthMiddleware($app['jwt_secret']), new PermissionMiddleware(new PermissionService($db))];
        // Грубая защита API + точный лимит 1/мин внутри ContactFormService
        $rate = new RateLimitMiddleware($db, 10, 60);
        $storage = (string) ($app['storage'] ?? dirname(__DIR__, 3) . '/storage');

        $svc = fn(): ContactFormService => new ContactFormService($db, $this->resolvedSettings(), $storage);

        // CSRF для публичной формы
        $router->get($p('/mail/csrf'), function () use ($svc) {
            Response::json(['data' => ['csrf' => $svc()->issueCsrf()]]);
        });

        // Публичная конфигурация для виджета (без секретов)
        $router->get($p('/mail/config'), function () {
            $s = $this->resolvedSettings();
            Response::json([
                'data' => [
                    'captcha_provider' => $s['captcha_provider'] ?? 'none',
                    'turnstile_site_key' => $s['turnstile_site_key'] ?? '',
                    'smartcaptcha_site_key' => $s['smartcaptcha_site_key'] ?? '',
                    'success_message' => $s['success_message'] ?? '',
                ],
            ]);
        });

        // Публичная отправка (дублирует /contact с теми же правилами)
        $router->post($p('/mail/contact'), function (Request $r) use ($svc) {
            $result = $svc()->handle($r);
            $http = (int) ($result['http'] ?? ($result['ok'] ? 201 : 400));
            if ($result['ok']) {
                Response::json(['success' => true, 'message' => $result['message'], 'data' => ['message' => $result['message']]], $http);
            }
            Response::json([
                'success' => false,
                'error' => $result['message'],
                'errors' => $result['errors'] ?? [],
                'data' => null,
            ], $http);
        }, [$rate]);

        // Тестовое письмо из админки
        $router->post($p('/admin/mail/test'), function (Request $r) use ($storage) {
            $settings = $this->resolvedSettings();
            $to = trim((string) ($r->input('to') ?? $settings['to_email'] ?? $settings['from_email'] ?? ''));
            if ($to === '') {
                Response::error('Укажите email получателя в настройках', 422);
            }
            try {
                $mailer = new Mailer($settings, $storage . '/logs');
                $mailer->sendHtml(
                    to: $to,
                    subject: 'Тест SMTP — Jasefly',
                    html: '<p>Если вы видите это письмо — SMTP плагина «Почта» настроен правильно.</p>',
                );
                Response::json(['success' => true, 'data' => ['message' => 'Тестовое письмо отправлено на ' . $to]]);
            } catch (\Throwable $e) {
                // Админу можно чуть подробнее, полный трейс — в mail.log
                Response::error('Не удалось отправить. Проверьте SMTP и лог storage/logs/mail.log', 500);
            }
        }, $protected);

        $router->post($p('/admin/mail/test-telegram'), function () use ($storage) {
            $settings = $this->resolvedSettings();
            $token = trim((string) ($settings['telegram_bot_token'] ?? ''));
            $chat = trim((string) ($settings['telegram_chat_id'] ?? ''));
            if ($token === '' || $chat === '') {
                Response::error('Укажите bot token и chat id в настройках', 422);
            }
            try {
                $tg = new TelegramNotifier($token, $chat, $storage . '/logs');
                $tg->send("Тест Telegram — Jasefly\nЕсли вы видите это сообщение, уведомления настроены.");
                Response::json(['success' => true, 'data' => ['message' => 'Тестовое сообщение отправлено в Telegram']]);
            } catch (\Throwable) {
                Response::error('Не удалось отправить в Telegram. Проверьте token/chat_id и лог storage/logs/mail.log', 500);
            }
        }, $protected);
    }

    public function adminNav(): array
    {
        return [
            ['group' => 'Система', 'path' => '/admin/mail', 'label' => 'Почта', 'permission' => 'settings.manage', 'icon' => 'mail'],
        ];
    }

    /** @return array<string, mixed> */
    private function resolvedSettings(): array
    {
        try {
            /** @var ModuleRegistry $registry */
            $registry = Container::getInstance()->get(ModuleRegistry::class);
            return $registry->state()->getSettings($this);
        } catch (\Throwable) {
            return $this->settings();
        }
    }
}
