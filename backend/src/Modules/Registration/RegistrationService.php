<?php
declare(strict_types=1);

namespace App\Modules\Registration;

use App\Core\Container;
use App\Core\ModuleRegistry;
use App\Database;
use App\Modules\Mail\Mailer;
use App\Request;
use App\Utils\Password;
use Throwable;

/**
 * Создание аккаунтов, верификация email, письма.
 */
final class RegistrationService
{
    /** @param array<string, mixed> $settings */
    public function __construct(
        private Database $db,
        private array $app,
        private array $settings,
    ) {}

    /** @return array<string, mixed> */
    public function publicConfig(): array
    {
        $s = $this->settings;
        return [
            'enabled' => (bool) ($s['registration_enabled'] ?? false),
            'require_name' => (bool) ($s['require_name'] ?? true),
            'min_password_length' => max(6, (int) ($s['min_password_length'] ?? 8)),
            'require_password_confirm' => (bool) ($s['require_password_confirm'] ?? true),
            'require_email_verification' => (bool) ($s['require_email_verification'] ?? false),
            'show_login_link' => (bool) ($s['show_login_link'] ?? true),
            'login_path' => (string) ($s['login_path'] ?? '/admin/login'),
            'honeypot_enabled' => (bool) ($s['honeypot_enabled'] ?? true),
            'terms_required' => (bool) ($s['terms_required'] ?? false),
            'terms_url' => (string) ($s['terms_url'] ?? '/privacy'),
            'terms_label' => (string) ($s['terms_label'] ?? 'Согласен с политикой конфиденциальности'),
            'closed_message' => (string) ($s['closed_message'] ?? 'Регистрация временно закрыта.'),
            'success_message' => (string) ($s['success_message'] ?? 'Аккаунт создан.'),
            'captcha' => $this->publicCaptchaConfig(),
        ];
    }

    public function isEnabled(): bool
    {
        return (bool) ($this->settings['registration_enabled'] ?? false);
    }

    /** @return array<string, mixed> */
    public function settings(): array
    {
        return $this->settings;
    }

    public function redirectAfterRegister(): string
    {
        $v = trim((string) ($this->settings['redirect_after_register'] ?? '/'));
        return $v !== '' ? $v : '/';
    }

    public function redirectAfterVerify(): string
    {
        $v = trim((string) ($this->settings['redirect_after_verify'] ?? '/admin/login'));
        return $v !== '' ? $v : '/admin/login';
    }

    public function autoLoginAfterVerify(): bool
    {
        return (bool) ($this->settings['auto_login_after_verify'] ?? false);
    }

    public function successMessage(): string
    {
        return (string) ($this->settings['success_message'] ?? 'Аккаунт создан.');
    }

    /**
     * @return array{user: array<string, mixed>, needs_verification: bool, auto_login: bool}
     */
    public function register(Request $r): array
    {
        if (!$this->isEnabled()) {
            throw new \RuntimeException((string) ($this->settings['closed_message'] ?? 'Регистрация закрыта'), 403);
        }

        if (!empty($this->settings['honeypot_enabled'])) {
            $hp = trim((string) ($r->input('website') ?? $r->input('company_url') ?? ''));
            if ($hp !== '') {
                throw new \RuntimeException('Rejected', 400);
            }
        }

        $captchaErr = $this->verifyCaptcha($r);
        if ($captchaErr !== null) {
            throw new \RuntimeException($captchaErr, 400);
        }

        $email = strtolower(trim((string) $r->input('email')));
        $name = trim((string) ($r->input('name') ?? ''));
        $password = (string) ($r->input('password') ?? '');
        $password2 = (string) ($r->input('password_confirm') ?? $r->input('password_confirmation') ?? '');
        $minLen = max(6, (int) ($this->settings['min_password_length'] ?? 8));

        if ($email === '' || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
            throw new \RuntimeException('Укажите корректный email', 422);
        }
        if (!empty($this->settings['require_name']) && $name === '') {
            throw new \RuntimeException('Укажите имя', 422);
        }
        if ($name === '') {
            $name = explode('@', $email)[0] ?: 'User';
        }
        if (strlen($password) < $minLen) {
            throw new \RuntimeException("Пароль не короче {$minLen} символов", 422);
        }
        if (!empty($this->settings['require_password_confirm']) && $password !== $password2) {
            throw new \RuntimeException('Пароли не совпадают', 422);
        }
        if (!empty($this->settings['terms_required']) && !(bool) ($r->input('terms_accepted') ?? false)) {
            throw new \RuntimeException('Нужно принять условия', 422);
        }

        if ($this->db->one('SELECT id FROM users WHERE email = ? LIMIT 1', [$email])) {
            throw new \RuntimeException('Пользователь с таким email уже есть', 409);
        }

        $role = $this->resolveRole($r);
        $needsVerify = (bool) ($this->settings['require_email_verification'] ?? false);
        $token = null;
        $expires = null;
        if ($needsVerify) {
            $token = bin2hex(random_bytes(32));
            $ttl = max(1, (int) ($this->settings['verification_token_ttl_hours'] ?? 48));
            $expires = date('Y-m-d H:i:s', time() + $ttl * 3600);
        }

        $this->ensureSchema();

        $this->db->run(
            'INSERT INTO users (email, password_hash, name, role, email_verified_at, email_verify_token, email_verify_expires_at, registration_source)
             VALUES (?,?,?,?,?,?,?,?)',
            [
                $email,
                Password::hash($password),
                $name,
                $role,
                $needsVerify ? null : date('Y-m-d H:i:s'),
                $token,
                $expires,
                'self',
            ]
        );
        $id = (int) $this->db->id();
        $user = $this->db->one('SELECT * FROM users WHERE id = ?', [$id]);
        if (!$user) {
            throw new \RuntimeException('Не удалось создать пользователя', 500);
        }

        if ($needsVerify && $token) {
            $this->sendVerificationMail($user, $token);
        }
        if (!empty($this->settings['notify_admin_on_register'])) {
            $this->notifyAdmin($user);
        }

        $autoLogin = !$needsVerify && (bool) ($this->settings['auto_login_after_register'] ?? true);

        return [
            'user' => $user,
            'needs_verification' => $needsVerify,
            'auto_login' => $autoLogin,
        ];
    }

    public function verifyEmail(string $token): array
    {
        $this->ensureSchema();
        $token = trim($token);
        if ($token === '' || strlen($token) < 16) {
            throw new \RuntimeException('Некорректная ссылка', 400);
        }
        $user = $this->db->one(
            'SELECT * FROM users WHERE email_verify_token = ? LIMIT 1',
            [$token]
        );
        if (!$user) {
            throw new \RuntimeException('Ссылка недействительна или уже использована', 400);
        }
        $exp = (string) ($user['email_verify_expires_at'] ?? '');
        if ($exp !== '' && strtotime($exp) < time()) {
            throw new \RuntimeException('Срок действия ссылки истёк', 400);
        }
        $this->db->run(
            'UPDATE users SET email_verified_at = NOW(), email_verify_token = NULL, email_verify_expires_at = NULL WHERE id = ?',
            [(int) $user['id']]
        );
        $fresh = $this->db->one('SELECT * FROM users WHERE id = ?', [(int) $user['id']]);
        return $fresh ?: $user;
    }

    public function resendVerification(string $email): void
    {
        $this->ensureSchema();
        $email = strtolower(trim($email));
        $user = $this->db->one('SELECT * FROM users WHERE email = ? LIMIT 1', [$email]);
        // Не раскрываем, есть ли email
        if (!$user || !empty($user['email_verified_at'])) {
            return;
        }
        $token = bin2hex(random_bytes(32));
        $ttl = max(1, (int) ($this->settings['verification_token_ttl_hours'] ?? 48));
        $this->db->run(
            'UPDATE users SET email_verify_token = ?, email_verify_expires_at = ? WHERE id = ?',
            [$token, date('Y-m-d H:i:s', time() + $ttl * 3600), (int) $user['id']]
        );
        $user['email_verify_token'] = $token;
        $this->sendVerificationMail($user, $token);
    }

    public function blockLoginUntilVerified(array $user): ?string
    {
        if (empty($this->settings['block_login_until_verified'])) {
            return null;
        }
        if (empty($this->settings['require_email_verification'])) {
            return null;
        }
        // Админов, созданных вручную, не блокируем
        $source = (string) ($user['registration_source'] ?? '');
        if ($source !== 'self') {
            return null;
        }
        if (!empty($user['email_verified_at'])) {
            return null;
        }
        return 'Подтвердите email перед входом. Проверьте почту или запросите письмо снова.';
    }

    public function ensureSchema(): void
    {
        static $done = false;
        if ($done) {
            return;
        }
        $insp = $this->db->inspector();
        $alters = [
            'email_verified_at' => 'DATETIME NULL',
            'email_verify_token' => 'VARCHAR(64) NULL',
            'email_verify_expires_at' => 'DATETIME NULL',
            'registration_source' => 'VARCHAR(40) NULL',
        ];
        foreach ($alters as $col => $def) {
            if (!$insp->columnExists('users', $col)) {
                try {
                    $this->db->run("ALTER TABLE users ADD COLUMN `$col` $def");
                } catch (Throwable) {
                }
            }
        }
        try {
            $this->db->run(
                "INSERT IGNORE INTO roles (slug, name, description, is_system) VALUES ('member', 'Member', 'Публичный пользователь (саморегистрация). Без доступа в админку.', 1)"
            );
        } catch (Throwable) {
        }
        $done = true;
    }

    private function resolveRole(Request $r): string
    {
        $allowed = ['member', 'editor'];
        $default = (string) ($this->settings['default_role'] ?? 'member');
        if (!in_array($default, $allowed, true)) {
            $default = 'member';
        }
        // Никогда не даём admin/super_admin через signup
        if (!empty($this->settings['allow_role_override'])) {
            $pick = strtolower(trim((string) ($r->input('role') ?? '')));
            if (in_array($pick, $allowed, true)) {
                return $pick;
            }
        }
        return $default;
    }

    /** @param array<string, mixed> $user */
    private function sendVerificationMail(array $user, string $token): void
    {
        $mailSettings = $this->mailSettings();
        if (($mailSettings['from_email'] ?? '') === '' || ($mailSettings['smtp_host'] ?? '') === '') {
            throw new \RuntimeException('Для подтверждения email настройте плагин «Почта» (SMTP)', 503);
        }
        $base = rtrim((string) ($this->app['public_url'] ?? $this->app['app_url'] ?? ''), '/');
        if ($base === '') {
            $https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off');
            $host = (string) ($_SERVER['HTTP_HOST'] ?? 'localhost');
            $base = ($https ? 'https' : 'http') . '://' . $host;
        }
        $verifyUrl = $base . '/register/verify?token=' . urlencode($token);
        $siteName = (string) ($this->siteName() ?: 'Portfolio');
        $ttl = (int) ($this->settings['verification_token_ttl_hours'] ?? 48);
        $map = [
            '{{name}}' => (string) ($user['name'] ?? ''),
            '{{email}}' => (string) ($user['email'] ?? ''),
            '{{verify_url}}' => $verifyUrl,
            '{{site_name}}' => $siteName,
            '{{ttl_hours}}' => (string) $ttl,
        ];
        $subject = strtr((string) ($this->settings['verify_email_subject'] ?? 'Подтвердите email — {{site_name}}'), $map);
        $html = strtr((string) ($this->settings['verify_email_html'] ?? '<p><a href="{{verify_url}}">Подтвердить</a></p>'), $map);
        $storage = (string) ($this->app['storage'] ?? dirname(__DIR__, 3) . '/storage');
        (new Mailer($mailSettings, $storage . '/logs'))->sendHtml(
            (string) $user['email'],
            $subject,
            $html,
        );
    }

    /** @param array<string, mixed> $user */
    private function notifyAdmin(array $user): void
    {
        try {
            $mailSettings = $this->mailSettings();
            $to = trim((string) ($this->settings['admin_notify_email'] ?? ''));
            if ($to === '') {
                $to = (string) ($mailSettings['to_email'] ?? $mailSettings['from_email'] ?? '');
            }
            if ($to === '' || ($mailSettings['smtp_host'] ?? '') === '') {
                return;
            }
            $storage = (string) ($this->app['storage'] ?? dirname(__DIR__, 3) . '/storage');
            $html = '<p>Новая регистрация</p><ul>'
                . '<li>Имя: ' . htmlspecialchars((string) $user['name'], ENT_QUOTES, 'UTF-8') . '</li>'
                . '<li>Email: ' . htmlspecialchars((string) $user['email'], ENT_QUOTES, 'UTF-8') . '</li>'
                . '<li>Роль: ' . htmlspecialchars((string) $user['role'], ENT_QUOTES, 'UTF-8') . '</li>'
                . '</ul>';
            (new Mailer($mailSettings, $storage . '/logs'))->sendHtml($to, 'Новая регистрация', $html);
        } catch (Throwable) {
        }
    }

    /** @return array<string, mixed> */
    private function mailSettings(): array
    {
        try {
            /** @var ModuleRegistry $reg */
            $reg = Container::getInstance()->get(ModuleRegistry::class);
            foreach ($reg->all() as $module) {
                if ($module->name() === 'mail') {
                    return $reg->state()->getSettings($module);
                }
            }
        } catch (Throwable) {
        }
        return [];
    }

    private function siteName(): string
    {
        try {
            $row = $this->db->one('SELECT site_name FROM site_settings LIMIT 1');
            return (string) ($row['site_name'] ?? '');
        } catch (Throwable) {
            return '';
        }
    }

    /** @return array<string, mixed> */
    private function publicCaptchaConfig(): array
    {
        $mode = (string) ($this->settings['captcha_mode'] ?? 'none');
        $mail = $this->mailSettings();
        if ($mode === 'inherit_mail') {
            $provider = (string) ($mail['captcha_provider'] ?? 'none');
            return [
                'provider' => $provider,
                'turnstile_site_key' => (string) ($mail['turnstile_site_key'] ?? ''),
                'smartcaptcha_site_key' => (string) ($mail['smartcaptcha_site_key'] ?? ''),
            ];
        }
        if ($mode === 'turnstile') {
            return [
                'provider' => 'turnstile',
                'turnstile_site_key' => (string) ($mail['turnstile_site_key'] ?? ''),
                'smartcaptcha_site_key' => '',
            ];
        }
        if ($mode === 'smartcaptcha') {
            return [
                'provider' => 'smartcaptcha',
                'turnstile_site_key' => '',
                'smartcaptcha_site_key' => (string) ($mail['smartcaptcha_site_key'] ?? ''),
            ];
        }
        return ['provider' => 'none', 'turnstile_site_key' => '', 'smartcaptcha_site_key' => ''];
    }

    private function verifyCaptcha(Request $r): ?string
    {
        $cfg = $this->publicCaptchaConfig();
        $provider = (string) ($cfg['provider'] ?? 'none');
        if ($provider === 'none' || $provider === '') {
            return null;
        }
        $mail = $this->mailSettings();
        $token = (string) ($r->input('captcha_token') ?? $r->input('cf-turnstile-response') ?? $r->input('smart-token') ?? '');
        if ($token === '') {
            return 'Пройдите проверку капчи';
        }
        if ($provider === 'turnstile') {
            $secret = (string) ($mail['turnstile_secret'] ?? '');
            if ($secret === '') {
                return 'Капча не настроена';
            }
            $ch = curl_init('https://challenges.cloudflare.com/turnstile/v0/siteverify');
            curl_setopt_array($ch, [
                CURLOPT_RETURNTRANSFER => true,
                CURLOPT_POST => true,
                CURLOPT_POSTFIELDS => http_build_query([
                    'secret' => $secret,
                    'response' => $token,
                    'remoteip' => $r->ip(),
                ]),
                CURLOPT_TIMEOUT => 8,
            ]);
            $raw = curl_exec($ch);
            curl_close($ch);
            $json = is_string($raw) ? json_decode($raw, true) : null;
            if (!is_array($json) || empty($json['success'])) {
                return 'Проверка Cloudflare Turnstile не пройдена';
            }
            return null;
        }
        if ($provider === 'smartcaptcha') {
            $secret = (string) ($mail['smartcaptcha_secret'] ?? '');
            if ($secret === '') {
                return 'Капча не настроена';
            }
            $ch = curl_init('https://smartcaptcha.yandexcloud.net/validate');
            curl_setopt_array($ch, [
                CURLOPT_RETURNTRANSFER => true,
                CURLOPT_POST => true,
                CURLOPT_POSTFIELDS => http_build_query([
                    'secret' => $secret,
                    'token' => $token,
                    'ip' => $r->ip(),
                ]),
                CURLOPT_TIMEOUT => 8,
            ]);
            $raw = curl_exec($ch);
            curl_close($ch);
            $json = is_string($raw) ? json_decode($raw, true) : null;
            if (!is_array($json) || ($json['status'] ?? '') !== 'ok') {
                return 'Проверка Яндекс SmartCaptcha не пройдена';
            }
            return null;
        }
        return null;
    }
}
