<?php
declare(strict_types=1);

namespace App\Modules\Support;

use App\Modules\Mail\Mailer;
use App\Modules\Mail\TelegramNotifier;

/**
 * Notify agents via email / Telegram / Discord / Max.
 * Replies stay in CMS admin — messengers are notifications only.
 */
final class SupportNotifier
{
    /**
     * @param array<string, mixed> $settings Support plugin settings
     * @param array<string, mixed> $mailSettings Mail plugin settings (fallback TG + SMTP)
     */
    public function __construct(
        private array $settings,
        private array $mailSettings,
        private string $logDir,
        private string $adminInboxUrl = '/admin/support',
    ) {}

    /**
     * @param array{public_id: string, preview: string, kind: string, note?: string} $payload
     */
    public function notifyNewActivity(array $payload): void
    {
        $kind = (string) ($payload['kind'] ?? 'message');
        $publicId = (string) ($payload['public_id'] ?? '');
        $preview = trim((string) ($payload['preview'] ?? ''));
        $note = trim((string) ($payload['note'] ?? ''));
        $title = $kind === 'ticket'
            ? '🔔 Новый тикет поддержки'
            : '💬 Новое сообщение в поддержке';
        $inbox = $this->adminInboxUrl !== '' ? $this->adminInboxUrl : '/admin/support';
        $text = $title . "\n"
            . 'Тикет: ' . $publicId . "\n"
            . ($note !== '' ? $note . "\n" : '')
            . ($preview !== '' ? "—\n" . mb_substr($preview, 0, 400) . "\n—\n" : '')
            . "Любой саппорт: откройте inbox и ответьте в CMS:\n"
            . $inbox . "\n"
            . '(пока вкладка открыта — вы онлайн для посетителя)';

        // Fan-out to all configured social / email channels so any agent can join.
        $sent = false;
        if ($this->channelOn('notify_telegram')) {
            $sent = $this->sendTelegram($text) || $sent;
        }
        if ($this->channelOn('notify_discord')) {
            $sent = $this->sendDiscord($text) || $sent;
        }
        if ($this->channelOn('notify_max')) {
            $sent = $this->sendMax($text) || $sent;
        }
        if ($this->channelOn('notify_email')) {
            $sent = $this->sendEmail($title, $text, $publicId) || $sent;
        }

        // If TG checkbox off but Mail already has bot — still notify (common setup).
        if (!$this->channelOn('notify_telegram') && $this->mailHasTelegram()) {
            $this->log('telegram', 'fallback: notify_telegram off, using Mail plugin credentials');
            $sent = $this->sendTelegram($text, true) || $sent;
        }

        if (!$sent) {
            $this->log('skip', 'no channel delivered (check notify_* + tokens). tg='
                . ($this->channelOn('notify_telegram') ? 'on' : 'off')
                . ' mail_tg=' . ($this->mailHasTelegram() ? 'yes' : 'no'));
        }
    }

    /** Test send for admin UI. @return array{ok: bool, error?: string} */
    public function testTelegram(): array
    {
        $token = $this->resolveTelegramToken();
        $chat = $this->resolveTelegramChat();
        if ($token === '' || $chat === '') {
            return ['ok' => false, 'error' => 'Нет bot token / chat id (Support или плагин Почта)'];
        }
        try {
            (new TelegramNotifier($token, $chat, $this->logDir))->send(
                "Тест Support → Telegram\nЕсли видите это — уведомления о тикетах доходят."
            );
            return ['ok' => true];
        } catch (\Throwable $e) {
            $this->log('telegram', $e->getMessage());
            return ['ok' => false, 'error' => $e->getMessage()];
        }
    }

    private function channelOn(string $key): bool
    {
        $v = $this->settings[$key] ?? false;
        if (is_bool($v)) {
            return $v;
        }
        if (is_int($v) || is_float($v)) {
            return (int) $v === 1;
        }
        $s = strtolower(trim((string) $v));
        return in_array($s, ['1', 'true', 'yes', 'on'], true);
    }

    private function mailHasTelegram(): bool
    {
        return $this->resolveTelegramToken() !== '' && $this->resolveTelegramChat() !== '';
    }

    private function resolveTelegramToken(): string
    {
        $token = trim((string) ($this->settings['telegram_bot_token'] ?? ''));
        if ($token === '') {
            $token = trim((string) ($this->mailSettings['telegram_bot_token'] ?? ''));
        }
        return $token;
    }

    private function resolveTelegramChat(): string
    {
        $chat = trim((string) ($this->settings['telegram_chat_id'] ?? ''));
        if ($chat === '') {
            $chat = trim((string) ($this->mailSettings['telegram_chat_id'] ?? ''));
        }
        return $chat;
    }

    private function sendTelegram(string $text, bool $force = false): bool
    {
        if (!$force && !$this->channelOn('notify_telegram') && !$this->mailHasTelegram()) {
            return false;
        }
        $token = $this->resolveTelegramToken();
        $chat = $this->resolveTelegramChat();
        if ($token === '' || $chat === '') {
            $this->log('telegram', 'skip: empty token or chat_id');
            return false;
        }
        try {
            (new TelegramNotifier($token, $chat, $this->logDir))->send($text);
            $this->log('telegram', 'sent ok');
            return true;
        } catch (\Throwable $e) {
            $this->log('telegram', $e->getMessage());
            return false;
        }
    }

    private function sendDiscord(string $text): bool
    {
        $url = trim((string) ($this->settings['discord_webhook_url'] ?? ''));
        if ($url === '' || !filter_var($url, FILTER_VALIDATE_URL)) {
            $this->log('discord', 'skip: no webhook url');
            return false;
        }
        return $this->httpJsonPost($url, ['content' => mb_substr($text, 0, 1900)], 'discord');
    }

    private function sendMax(string $text): bool
    {
        $apiUrl = trim((string) ($this->settings['max_api_url'] ?? ''));
        $token = trim((string) ($this->settings['max_bot_token'] ?? ''));
        $chatId = trim((string) ($this->settings['max_chat_id'] ?? ''));
        if ($apiUrl === '' || $token === '' || $chatId === '') {
            $this->log('max', 'skip: incomplete settings');
            return false;
        }
        if (!filter_var($apiUrl, FILTER_VALIDATE_URL)) {
            return false;
        }
        return $this->httpJsonPost($apiUrl, [
            'chat_id' => $chatId,
            'text' => mb_substr($text, 0, 4000),
            'access_token' => $token,
        ], 'max', ['Authorization: Bearer ' . $token]);
    }

    private function sendEmail(string $subject, string $text, string $publicId): bool
    {
        $to = trim((string) ($this->settings['notify_email_to'] ?? ''));
        if ($to === '') {
            $to = trim((string) ($this->mailSettings['to_email'] ?? $this->mailSettings['from_email'] ?? ''));
        }
        if ($to === '') {
            $this->log('email', 'skip: no recipient');
            return false;
        }
        $mailCfg = $this->mailSettings;
        if (trim((string) ($mailCfg['from_email'] ?? '')) === '') {
            $this->log('email', 'skip: no from_email in Mail plugin');
            return false;
        }
        $html = '<p>' . nl2br(htmlspecialchars($text, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8')) . '</p>'
            . '<p><small>Тикет #' . htmlspecialchars($publicId, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8') . '</small></p>';
        try {
            (new Mailer($mailCfg, $this->logDir))->sendHtml($to, $subject, $html);
            $this->log('email', 'sent ok to ' . $to);
            return true;
        } catch (\Throwable $e) {
            $this->log('email', $e->getMessage());
            return false;
        }
    }

    /**
     * @param array<string, mixed> $body
     * @param list<string> $extraHeaders
     */
    private function httpJsonPost(string $url, array $body, string $channel, array $extraHeaders = []): bool
    {
        $payload = json_encode($body, JSON_UNESCAPED_UNICODE);
        if ($payload === false) {
            return false;
        }
        $headers = array_merge(['Content-Type: application/json'], $extraHeaders);
        $err = null;
        if (function_exists('curl_init')) {
            $ch = curl_init($url);
            curl_setopt_array($ch, [
                CURLOPT_POST => true,
                CURLOPT_POSTFIELDS => $payload,
                CURLOPT_HTTPHEADER => $headers,
                CURLOPT_RETURNTRANSFER => true,
                CURLOPT_TIMEOUT => 8,
            ]);
            $resp = curl_exec($ch);
            if ($resp === false) {
                $err = curl_error($ch);
            }
            curl_close($ch);
        } else {
            $err = 'curl missing';
        }
        if ($err !== null) {
            $this->log($channel, $err);
            return false;
        }
        $this->log($channel, 'sent ok');
        return true;
    }

    private function log(string $channel, string $msg): void
    {
        if (!is_dir($this->logDir)) {
            @mkdir($this->logDir, 0755, true);
        }
        @file_put_contents(
            $this->logDir . '/support.log',
            date('c') . " notify.{$channel} " . mb_substr($msg, 0, 500) . "\n",
            FILE_APPEND
        );
    }
}
