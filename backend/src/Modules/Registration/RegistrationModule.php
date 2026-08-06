<?php
declare(strict_types=1);

namespace App\Modules\Registration;

use App\Core\AbstractModule;
use App\Core\Container;
use App\Core\ModuleRegistry;
use App\Database;
use App\Middleware\RateLimitMiddleware;
use App\Request;
use App\Router;

/**
 * Публичная саморегистрация: форма, роль по умолчанию, verify email, шаблон страницы.
 */
final class RegistrationModule extends AbstractModule
{
    public function name(): string
    {
        return 'registration';
    }

    public function label(): string
    {
        return 'Регистрация';
    }

    public function priority(): int
    {
        return 45;
    }

    public function boot(Database $db, array $app): void
    {
        try {
            (new RegistrationService($db, $app, $this->resolvedSettings()))->ensureSchema();
        } catch (\Throwable) {
        }
    }

    public function settingsSchema(): array
    {
        return [
            ['key' => '_heading_general', 'label' => 'Регистрация', 'type' => 'heading',
                'help' => 'Публичная самостоятельная регистрация. Роль member — без доступа в админку.'],
            ['key' => 'registration_enabled', 'label' => 'Разрешить регистрацию', 'type' => 'checkbox', 'default' => false],
            ['key' => 'default_role', 'label' => 'Роль при регистрации', 'type' => 'select', 'default' => 'member',
                'options' => [
                    ['value' => 'member', 'label' => 'Member — сайт, без админки (рекомендуется)'],
                    ['value' => 'editor', 'label' => 'Editor — доступ в админку к контенту'],
                ],
                'help' => 'admin / super_admin через регистрацию назначить нельзя.'],
            ['key' => 'allow_role_override', 'label' => 'Позволить выбрать роль в форме (опасно)', 'type' => 'checkbox', 'default' => false],
            ['key' => 'auto_login_after_register', 'label' => 'Авто-вход после регистрации', 'type' => 'checkbox', 'default' => true,
                'help' => 'Не применяется, если нужно подтверждение email.'],
            ['key' => 'redirect_after_register', 'label' => 'URL после регистрации', 'type' => 'text', 'default' => '/'],
            ['key' => 'redirect_after_verify', 'label' => 'URL после подтверждения email', 'type' => 'text', 'default' => '/admin/login'],
            ['key' => 'auto_login_after_verify', 'label' => 'Авто-вход после подтверждения email', 'type' => 'checkbox', 'default' => false],
            ['key' => 'closed_message', 'label' => 'Текст при закрытой регистрации', 'type' => 'text',
                'default' => 'Регистрация временно закрыта.'],
            ['key' => 'success_message', 'label' => 'Сообщение после регистрации', 'type' => 'text',
                'default' => 'Аккаунт создан. Если нужно — подтвердите email.'],

            ['key' => '_heading_fields', 'label' => 'Поля формы', 'type' => 'heading'],
            ['key' => 'require_name', 'label' => 'Требовать имя', 'type' => 'checkbox', 'default' => true],
            ['key' => 'min_password_length', 'label' => 'Мин. длина пароля', 'type' => 'number', 'default' => 8],
            ['key' => 'require_password_confirm', 'label' => 'Подтверждение пароля', 'type' => 'checkbox', 'default' => true],
            ['key' => 'show_login_link', 'label' => 'Ссылка на вход', 'type' => 'checkbox', 'default' => true],
            ['key' => 'login_path', 'label' => 'Путь страницы входа', 'type' => 'text', 'default' => '/admin/login'],
            ['key' => 'terms_required', 'label' => 'Требовать согласие с условиями', 'type' => 'checkbox', 'default' => false],
            ['key' => 'terms_url', 'label' => 'URL условий / privacy', 'type' => 'text', 'default' => '/privacy'],
            ['key' => 'terms_label', 'label' => 'Текст чекбокса согласия', 'type' => 'text',
                'default' => 'Согласен с политикой конфиденциальности'],

            ['key' => '_heading_verify', 'label' => 'Подтверждение email', 'type' => 'heading',
                'help' => 'Нужен настроенный плагин «Почта» (SMTP).'],
            ['key' => 'require_email_verification', 'label' => 'Требовать подтверждение email', 'type' => 'checkbox', 'default' => false],
            ['key' => 'verification_token_ttl_hours', 'label' => 'TTL ссылки (часы)', 'type' => 'number', 'default' => 48],
            ['key' => 'block_login_until_verified', 'label' => 'Блокировать вход до подтверждения', 'type' => 'checkbox', 'default' => true],
            ['key' => 'verify_email_subject', 'label' => 'Тема письма', 'type' => 'text',
                'default' => 'Подтвердите email — {{site_name}}'],
            ['key' => 'verify_email_html', 'label' => 'HTML письма', 'type' => 'textarea',
                'default' => "<p>Здравствуйте, {{name}}!</p>\n<p><a href=\"{{verify_url}}\">Подтвердить email</a></p>\n<p>Ссылка действует {{ttl_hours}} ч.</p>",
                'help' => 'Плейсхолдеры: {{name}}, {{email}}, {{verify_url}}, {{site_name}}, {{ttl_hours}}'],
            ['key' => 'notify_admin_on_register', 'label' => 'Письмо админу о новой регистрации', 'type' => 'checkbox', 'default' => false],
            ['key' => 'admin_notify_email', 'label' => 'Email админа (пусто = Mail to_email)', 'type' => 'text', 'default' => ''],

            ['key' => '_heading_abuse', 'label' => 'Антиабьюз', 'type' => 'heading'],
            ['key' => 'rate_limit_per_minute', 'label' => 'Лимит регистраций с IP / мин', 'type' => 'number', 'default' => 3],
            ['key' => 'honeypot_enabled', 'label' => 'Honeypot-поле', 'type' => 'checkbox', 'default' => true],
            ['key' => 'captcha_mode', 'label' => 'Капча', 'type' => 'select', 'default' => 'none',
                'options' => [
                    ['value' => 'none', 'label' => 'Выключена'],
                    ['value' => 'inherit_mail', 'label' => 'Как в плагине Почта'],
                    ['value' => 'turnstile', 'label' => 'Cloudflare Turnstile (ключи из Почты)'],
                    ['value' => 'smartcaptcha', 'label' => 'Яндекс SmartCaptcha (ключи из Почты)'],
                ]],
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
            ['type' => 'auth-register', 'label' => 'Форма регистрации', 'category' => 'system'],
        ];
    }

    public function publicRoutes(): array
    {
        return [
            ['path' => '/register', 'label' => 'Регистрация', 'component' => 'RegisterPage'],
            ['path' => '/register/verify', 'label' => 'Подтверждение email', 'component' => 'RegisterVerifyPage'],
        ];
    }

    public function demoPages(): array
    {
        if (class_exists(\App\Modules\System\SystemTemplates::class)) {
            return \App\Modules\System\SystemTemplates::demoPagesForPlugin('registration');
        }
        return [
            [
                'slug' => 'register',
                'title' => 'Регистрация',
                'status' => 'published',
                'template' => 'system-auth',
                'seo_title' => 'Регистрация',
                'seo_description' => 'Создание аккаунта',
                'layout' => $this->registerLayout(),
            ],
        ];
    }

    public function registerRoutes(Router $router, Database $db, array $app, string $apiPrefix): void
    {
        $p = fn(string $path) => rtrim($apiPrefix, '/') . $path;
        $settings = $this->resolvedSettings();
        $limit = max(1, (int) ($settings['rate_limit_per_minute'] ?? 3));
        $rate = new RateLimitMiddleware($db, $limit, 60);
        $svc = fn(): RegistrationService => new RegistrationService($db, $app, $this->resolvedSettings());
        $ctrl = fn(): RegistrationController => new RegistrationController($db, $app, $svc());

        $router->get($p('/registration/config'), fn(Request $r) => $ctrl()->config($r));
        $router->post($p('/auth/register'), fn(Request $r) => $ctrl()->register($r), [$rate]);
        $router->post($p('/registration/register'), fn(Request $r) => $ctrl()->register($r), [$rate]);
        $router->get($p('/auth/verify-email'), fn(Request $r) => $ctrl()->verify($r));
        $router->post($p('/auth/verify-email'), fn(Request $r) => $ctrl()->verify($r));
        $router->post($p('/auth/resend-verification'), fn(Request $r) => $ctrl()->resend($r), [$rate]);
    }

    /** @return array<string, mixed> */
    private function resolvedSettings(): array
    {
        try {
            /** @var ModuleRegistry $reg */
            $reg = Container::getInstance()->get(ModuleRegistry::class);
            foreach ($reg->all() as $module) {
                if ($module->name() === 'registration') {
                    return $reg->state()->getSettings($module);
                }
            }
        } catch (\Throwable) {
        }
        return $this->settings();
    }

    /** @return array<string, mixed> */
    private function registerLayout(): array
    {
        return [
            'version' => 1,
            'meta' => ['seed' => true],
            'elements' => [[
                'id' => 'sec_register',
                'elType' => 'section',
                'settings' => ['paddingY' => '4rem', 'gap' => '1.5rem'],
                'elements' => [[
                    'id' => 'col_register',
                    'elType' => 'column',
                    'settings' => ['width' => 100],
                    'elements' => [
                        [
                            'id' => 'w_reg_h',
                            'elType' => 'widget',
                            'widgetType' => 'heading',
                            'settings' => [
                                'text' => 'Регистрация',
                                'tag' => 'h1',
                                'size' => 'lg',
                                'align' => 'center',
                            ],
                            'elements' => [],
                        ],
                        [
                            'id' => 'w_reg_form',
                            'elType' => 'widget',
                            'widgetType' => 'auth-register',
                            'settings' => [
                                'title' => 'Создать аккаунт',
                                'subtitle' => 'Email и пароль',
                            ],
                            'elements' => [],
                        ],
                    ],
                ]],
            ]],
        ];
    }
}
