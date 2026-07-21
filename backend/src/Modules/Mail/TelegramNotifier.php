<?php
declare(strict_types=1);

namespace App\Modules\Mail;

/**
 * Minimal Telegram Bot API helper for contact-form notifications.
 */
final class TelegramNotifier
{
    public function __construct(
        private string $botToken,
        private string $chatId,
        private string $logDir,
    ) {}

    public function send(string $text): void
    {
        $token = trim($this->botToken);
        $chat = trim($this->chatId);
        if ($token === '' || $chat === '') {
            throw new \RuntimeException('Telegram bot token or chat id is empty');
        }
        $url = 'https://api.telegram.org/bot' . rawurlencode($token) . '/sendMessage';
        $payload = http_build_query([
            'chat_id' => $chat,
            'text' => mb_substr($text, 0, 4000),
            'disable_web_page_preview' => '1',
        ]);

        $body = null;
        $err = null;
        if (function_exists('curl_init')) {
            $ch = curl_init($url);
            curl_setopt_array($ch, [
                CURLOPT_POST => true,
                CURLOPT_POSTFIELDS => $payload,
                CURLOPT_RETURNTRANSFER => true,
                CURLOPT_TIMEOUT => 12,
                CURLOPT_HTTPHEADER => ['Content-Type: application/x-www-form-urlencoded'],
            ]);
            $body = curl_exec($ch);
            if ($body === false) {
                $err = curl_error($ch);
            }
            curl_close($ch);
        } else {
            $ctx = stream_context_create([
                'http' => [
                    'method' => 'POST',
                    'header' => "Content-Type: application/x-www-form-urlencoded\r\n",
                    'content' => $payload,
                    'timeout' => 12,
                    'ignore_errors' => true,
                ],
            ]);
            $body = @file_get_contents($url, false, $ctx);
            if ($body === false) {
                $err = 'file_get_contents failed';
            }
        }

        $this->log('send', $body, $err);
        if ($err !== null) {
            throw new \RuntimeException('Telegram request failed: ' . $err);
        }
        $json = json_decode((string) $body, true);
        if (!is_array($json) || empty($json['ok'])) {
            $desc = is_array($json) ? (string) ($json['description'] ?? 'unknown') : 'invalid response';
            throw new \RuntimeException('Telegram API error: ' . $desc);
        }
    }

    private function log(string $action, mixed $body, ?string $err): void
    {
        if (!is_dir($this->logDir)) {
            @mkdir($this->logDir, 0755, true);
        }
        $line = date('c') . " telegram.{$action} err=" . ($err ?? '-') . ' body=' . mb_substr((string) $body, 0, 500) . "\n";
        @file_put_contents($this->logDir . '/mail.log', $line, FILE_APPEND);
    }
}
