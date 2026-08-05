<?php
declare(strict_types=1);

namespace App\Modules\Mail;

use App\Database;
use App\Request;
use App\Utils\Security;

/**
 * Обработка формы обратной связи с многослойной защитой:
 * CSRF → honeypot → captcha (опционально) → rate limit 1/IP/мин → валидация → Mailer.
 *
 * Технические ошибки SMTP пишутся в лог и не отдаются посетителю.
 */
final class ContactFormService
{
    /** @param array<string, mixed> $settings */
    public function __construct(
        private Database $db,
        private array $settings,
        private string $storageDir,
    ) {}

    /**
     * @return array{ok: bool, message: string, http?: int, errors?: array<string, string>}
     */
    public function handle(Request $r): array
    {
        // 1) Honeypot — боты заполняют скрытое поле; отвечаем «успехом», чтобы не палиться.
        if ($this->filled($r->input('website')) || $this->filled($r->input('company_url')) || $this->filled($r->input('hp_field'))) {
            return ['ok' => true, 'message' => $this->successMessage(), 'http' => 201];
        }

        // 2) CSRF
        if (!$this->verifyCsrf($r)) {
            return ['ok' => false, 'message' => 'Сессия устарела. Обновите страницу и попробуйте снова.', 'http' => 419];
        }

        // 3) Captcha (Cloudflare Turnstile / Yandex SmartCaptcha), если включена
        $captchaError = $this->verifyCaptcha($r);
        if ($captchaError !== null) {
            return ['ok' => false, 'message' => $captchaError, 'http' => 422];
        }

        // 4) Rate limit: не более 1 сообщения с одного IP в минуту
        if (!$this->allowIp($r->ip())) {
            return ['ok' => false, 'message' => 'Слишком часто. Подождите минуту и отправьте снова.', 'http' => 429];
        }

        // 5) Валидация длины и формата
        $name = Security::sanitize((string) ($r->input('name') ?? ''));
        $email = strtolower(trim((string) ($r->input('email') ?? '')));
        $message = trim((string) ($r->input('message') ?? ''));
        $subject = Security::sanitize((string) ($r->input('subject') ?? 'Сообщение с сайта'));

        $errors = [];
        if ($name === '' || mb_strlen($name) > 120) {
            $errors['name'] = 'Укажите имя (до 120 символов)';
        }
        if ($email === '' || !filter_var($email, FILTER_VALIDATE_EMAIL) || mb_strlen($email) > 255) {
            $errors['email'] = 'Укажите корректный email';
        }
        // Защита от header injection в email
        if (preg_match('/[\r\n]/', $email) || preg_match('/[\r\n]/', $name)) {
            $errors['email'] = 'Некорректные символы в данных';
        }
        $msgLen = mb_strlen($message);
        if ($msgLen < 3 || $msgLen > 5000) {
            $errors['message'] = 'Сообщение должно быть от 3 до 5000 символов';
        }
        if ($errors) {
            return ['ok' => false, 'message' => 'Проверьте поля формы', 'http' => 422, 'errors' => $errors];
        }

        $data = [
            'name' => $name,
            'email' => $email,
            'subject' => mb_substr($subject !== '' ? $subject : 'Сообщение с сайта', 0, 200),
            'message' => $message,
        ];

        // 6) Сохраняем в БД (даже если SMTP упадёт — сообщение не потеряется)
        try {
            $this->db->run(
                'INSERT INTO contact_messages(name,email,subject,message,ip_address,user_agent) VALUES(?,?,?,?,?,?)',
                [
                    $data['name'],
                    $data['email'],
                    $data['subject'],
                    $data['message'],
                    $r->ip(),
                    mb_substr((string) ($r->header('User-Agent') ?? ''), 0, 500),
                ]
            );
        } catch (\Throwable) {
            // Таблица может отсутствовать на свежей установке — не блокируем отправку письма
        }

        // 6b) Telegram + webhook event (best-effort)
        $this->notifyTelegram($data);
        $this->emitContactEvent($data);

        // 7) Отправка через Mailer (без mail())
        $to = trim((string) ($this->settings['to_email'] ?? ''));
        if ($to === '') {
            // Письмо некуда слать, но форма сохранена — пользователю показываем успех
            return ['ok' => true, 'message' => $this->successMessage(), 'http' => 201];
        }

        try {
            $mailer = new Mailer($this->settings, $this->storageDir . '/logs');
            $html = $mailer->buildContactHtml($data);
            $mailer->sendHtml(
                to: $to,
                subject: '[Сайт] ' . $data['subject'],
                html: $html,
                replyTo: $data['email'],
            );
        } catch (\Throwable) {
            // Технические детали только в логе Mailer — посетителю общая фраза.
            // Сообщение уже в БД; не раскрываем SMTP-ошибку.
            return [
                'ok' => true,
                'message' => $this->successMessage(),
                'http' => 201,
            ];
        }

        return ['ok' => true, 'message' => $this->successMessage(), 'http' => 201];
    }

    /** @param array{name:string,email:string,subject:string,message:string} $data */
    private function notifyTelegram(array $data): void
    {
        $enabled = (string) ($this->settings['telegram_enabled'] ?? '0');
        if (!in_array($enabled, ['1', 'true', 'yes', 'on'], true)) {
            return;
        }
        $token = trim((string) ($this->settings['telegram_bot_token'] ?? ''));
        $chat = trim((string) ($this->settings['telegram_chat_id'] ?? ''));
        if ($token === '' || $chat === '') {
            return;
        }
        try {
            $text = "Новая заявка с сайта\n"
                . "Имя: {$data['name']}\n"
                . "Email: {$data['email']}\n"
                . "Тема: {$data['subject']}\n\n"
                . $data['message'];
            (new TelegramNotifier($token, $chat, $this->storageDir . '/logs'))->send($text);
        } catch (\Throwable) {
            // never fail the form
        }
    }

    /** @param array{name:string,email:string,subject:string,message:string} $data */
    private function emitContactEvent(array $data): void
    {
        try {
            $events = \App\Core\Container::getInstance()->get(\App\Core\EventDispatcher::class);
            $events->dispatch('contact.message', $data);
        } catch (\Throwable) {
            // optional
        }
    }

    /** Выдать CSRF-токен (создаёт сессию при необходимости). */
    public function issueCsrf(): string
    {
        if (session_status() !== PHP_SESSION_ACTIVE) {
            @session_start();
        }
        return Security::csrf();
    }

    private function verifyCsrf(Request $r): bool
    {
        if (session_status() !== PHP_SESSION_ACTIVE) {
            @session_start();
        }
        $token = (string) ($r->input('csrf') ?? $r->input('_csrf') ?? $r->header('X-CSRF-Token') ?? '');
        return Security::verifyCsrf($token);
    }

    private function allowIp(string $ip): bool
    {
        $endpoint = 'mail:contact';
        $windowStart = date('Y-m-d H:i:s', time() - 60);
        $row = $this->db->one(
            'SELECT id, attempts, window_start FROM rate_limits WHERE ip_address=? AND endpoint=? AND window_start >= ? ORDER BY id DESC LIMIT 1',
            [$ip, $endpoint, $windowStart]
        );
        if ($row && (int) $row['attempts'] >= 1) {
            return false;
        }
        if ($row) {
            $this->db->run('UPDATE rate_limits SET attempts = attempts + 1 WHERE id=?', [$row['id']]);
        } else {
            $now = $this->db->driver() === 'sqlite' ? "datetime('now')" : 'NOW()';
            $this->db->run(
                "INSERT INTO rate_limits(ip_address, endpoint, attempts, window_start) VALUES(?,?,1,{$now})",
                [$ip, $endpoint]
            );
        }
        return true;
    }

    private function verifyCaptcha(Request $r): ?string
    {
        $provider = (string) ($this->settings['captcha_provider'] ?? 'none');
        if ($provider === 'none' || $provider === '') {
            return null;
        }
        $token = (string) ($r->input('captcha_token') ?? $r->input('cf-turnstile-response') ?? $r->input('smart-token') ?? '');
        if ($token === '') {
            return 'Подтвердите, что вы не робот';
        }

        try {
            if ($provider === 'turnstile') {
                return $this->verifyTurnstile($token, $r->ip());
            }
            if ($provider === 'smartcaptcha') {
                return $this->verifySmartCaptcha($token, $r->ip());
            }
        } catch (\Throwable) {
            return 'Не удалось проверить капчу. Попробуйте позже.';
        }
        return null;
    }

    private function verifyTurnstile(string $token, string $ip): ?string
    {
        $secret = (string) ($this->settings['turnstile_secret'] ?? '');
        if ($secret === '') {
            return 'Капча не настроена на сервере';
        }
        $res = $this->httpPost('https://challenges.cloudflare.com/turnstile/v0/siteverify', [
            'secret' => $secret,
            'response' => $token,
            'remoteip' => $ip,
        ]);
        if (!($res['success'] ?? false)) {
            return 'Проверка Cloudflare Turnstile не пройдена';
        }
        return null;
    }

    private function verifySmartCaptcha(string $token, string $ip): ?string
    {
        $secret = (string) ($this->settings['smartcaptcha_secret'] ?? '');
        if ($secret === '') {
            return 'Капча не настроена на сервере';
        }
        $res = $this->httpPost('https://smartcaptcha.yandexcloud.net/validate', [
            'secret' => $secret,
            'token' => $token,
            'ip' => $ip,
        ]);
        // Yandex: status === "ok"
        if (($res['status'] ?? '') !== 'ok') {
            return 'Проверка Яндекс SmartCaptcha не пройдена';
        }
        return null;
    }

    /** @param array<string, string> $fields @return array<string, mixed> */
    private function httpPost(string $url, array $fields): array
    {
        $ctx = stream_context_create([
            'http' => [
                'method' => 'POST',
                'header' => "Content-Type: application/x-www-form-urlencoded\r\n",
                'content' => http_build_query($fields),
                'timeout' => 8,
                'ignore_errors' => true,
            ],
        ]);
        $raw = @file_get_contents($url, false, $ctx);
        if ($raw === false) {
            throw new \RuntimeException('captcha http failed');
        }
        $json = json_decode($raw, true);
        return is_array($json) ? $json : [];
    }

    private function successMessage(): string
    {
        $custom = trim((string) ($this->settings['success_message'] ?? ''));
        if ($custom !== '') {
            return $custom;
        }
        try {
            $info = $this->db->one('SELECT form_success_message FROM contact_info LIMIT 1');
            if (!empty($info['form_success_message'])) {
                return (string) $info['form_success_message'];
            }
        } catch (\Throwable) {
        }
        return 'Спасибо! Сообщение отправлено. Мы ответим вам в ближайшее время.';
    }

    private function filled(mixed $v): bool
    {
        return is_string($v) && trim($v) !== '';
    }
}
