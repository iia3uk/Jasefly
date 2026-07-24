<?php
declare(strict_types=1);

namespace App\Modules\Forms;

use App\Database;

final class FormActionRegistry
{
    /** @var array<string, callable(Database, array, array, array): mixed> */
    private static array $handlers = [];

    public static function register(string $type, callable $handler): void
    {
        self::$handlers[$type] = $handler;
    }

    public static function bootDefaults(): void
    {
        self::register('save_submission', static function (Database $db, array $form, array $submission, array $config): void {
            // Already persisted before actions; keep as explicit no-op marker.
        });

        self::register('redirect', static function (Database $db, array $form, array $submission, array $config): array {
            $url = (string) ($config['url'] ?? $form['redirect_url'] ?? '');
            return ['redirect_url' => $url !== '' ? $url : null];
        });

        self::register('send_email', static function (Database $db, array $form, array $submission, array $config): void {
            if (!class_exists(\App\Modules\Mail\Mailer::class)) {
                return;
            }
            try {
                $mailSettings = self::mailPluginSettings($db);
                $to = (string) ($config['to'] ?? $mailSettings['notify_to'] ?? $mailSettings['from_email'] ?? '');
                if ($to === '' || !filter_var($to, FILTER_VALIDATE_EMAIL)) {
                    return;
                }
                $body = "Форма: {$form['name']}\n";
                foreach ($submission['values'] ?? [] as $k => $v) {
                    $body .= "{$k}: {$v}\n";
                }
                $html = '<pre style="font:14px/1.4 sans-serif">' . htmlspecialchars($body, ENT_QUOTES, 'UTF-8') . '</pre>';
                $logDir = dirname(__DIR__, 3) . '/storage/logs';
                (new \App\Modules\Mail\Mailer($mailSettings, $logDir))->sendHtml(
                    $to,
                    'Новая заявка: ' . $form['name'],
                    $html,
                    is_string($submission['values']['email'] ?? null) ? (string) $submission['values']['email'] : null,
                    $body
                );
            } catch (\Throwable) {
            }
        });

        self::register('send_telegram', static function (Database $db, array $form, array $submission, array $config): void {
            if (!class_exists(\App\Modules\Mail\TelegramNotifier::class)) {
                return;
            }
            try {
                $mailSettings = self::mailPluginSettings($db);
                $token = (string) ($config['bot_token'] ?? $mailSettings['telegram_bot_token'] ?? '');
                $chat = (string) ($config['chat_id'] ?? $mailSettings['telegram_chat_id'] ?? '');
                if ($token === '' || $chat === '') {
                    return;
                }
                $text = "Форма: {$form['name']}\n";
                foreach ($submission['values'] ?? [] as $k => $v) {
                    $text .= "{$k}: " . (string) $v . "\n";
                }
                $logDir = dirname(__DIR__, 3) . '/storage/logs';
                (new \App\Modules\Mail\TelegramNotifier($token, $chat, $logDir))->send($text);
            } catch (\Throwable) {
            }
        });

        self::register('send_webhook', static function (Database $db, array $form, array $submission, array $config): void {
            $url = (string) ($config['url'] ?? '');
            if (!filter_var($url, FILTER_VALIDATE_URL) || !preg_match('#^https?://#i', $url)) {
                return;
            }
            $host = parse_url($url, PHP_URL_HOST);
            if (!$host || self::isPrivateHost((string) $host)) {
                return;
            }
            $ch = curl_init($url);
            curl_setopt_array($ch, [
                CURLOPT_POST => true,
                CURLOPT_POSTFIELDS => json_encode([
                    'event' => 'form.submitted',
                    'form' => ['id' => $form['id'], 'slug' => $form['slug'], 'name' => $form['name']],
                    'submission' => [
                        'public_id' => $submission['public_id'] ?? null,
                        'values' => $submission['values'] ?? [],
                    ],
                ], JSON_UNESCAPED_UNICODE),
                CURLOPT_HTTPHEADER => ['Content-Type: application/json'],
                CURLOPT_RETURNTRANSFER => true,
                CURLOPT_TIMEOUT => 5,
                CURLOPT_PROTOCOLS => CURLPROTO_HTTP | CURLPROTO_HTTPS,
            ]);
            curl_exec($ch);
            curl_close($ch);
        });

        self::register('create_notification', static function (Database $db, array $form, array $submission, array $config): void {
            if (!class_exists(\App\Modules\Notifications\NotificationService::class)) {
                return;
            }
            try {
                (new \App\Modules\Notifications\NotificationService($db))->notifyAdmins(
                    'form.submitted',
                    'Новая заявка: ' . $form['name'],
                    (string) ($submission['public_id'] ?? ''),
                    ['form_id' => $form['id'], 'submission_public_id' => $submission['public_id'] ?? null]
                );
            } catch (\Throwable) {
            }
        });

        self::register('start_automation', static function (Database $db, array $form, array $submission, array $config): void {
            // Event already dispatched; Automation listens to form.submitted.
        });

        self::register('subscribe', static function (Database $db, array $form, array $submission, array $config): void {
            if (!class_exists(\App\Modules\Newsletter\NewsletterService::class)) {
                return;
            }
            try {
                $email = (string) (($submission['values']['email'] ?? '') ?: '');
                if ($email === '') {
                    return;
                }
                (new \App\Modules\Newsletter\NewsletterService($db))->subscribe(
                    $email,
                    (string) ($submission['values']['name'] ?? ''),
                    (int) ($config['list_id'] ?? 0) ?: null,
                    'form:' . ($form['slug'] ?? '')
                );
            } catch (\Throwable) {
            }
        });
    }

    /**
     * @param list<array<string, mixed>> $actions
     * @return array<string, mixed>
     */
    public static function runAll(Database $db, array $form, array $submission, array $actions): array
    {
        $extra = [];
        foreach ($actions as $action) {
            if (!(int) ($action['is_active'] ?? 1)) {
                continue;
            }
            $type = (string) ($action['type'] ?? '');
            $handler = self::$handlers[$type] ?? null;
            if (!$handler) {
                continue;
            }
            $config = $action['config'] ?? [];
            if (is_string($config)) {
                $config = json_decode($config, true) ?: [];
            }
            if (!is_array($config)) {
                $config = [];
            }
            try {
                $result = $handler($db, $form, $submission, $config);
                if (is_array($result)) {
                    $extra = array_merge($extra, $result);
                }
            } catch (\Throwable) {
            }
        }
        return $extra;
    }

    private static function isPrivateHost(string $host): bool
    {
        if (in_array(strtolower($host), ['localhost', '127.0.0.1', '::1'], true)) {
            return true;
        }
        $ip = gethostbyname($host);
        if ($ip === $host && !filter_var($host, FILTER_VALIDATE_IP)) {
            return false;
        }
        return !filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE);
    }

    /** @return array<string, mixed> */
    private static function mailPluginSettings(Database $db): array
    {
        try {
            $row = $db->one("SELECT settings FROM modules WHERE name='mail' LIMIT 1");
            if ($row && !empty($row['settings'])) {
                $decoded = json_decode((string) $row['settings'], true);
                if (is_array($decoded)) {
                    return $decoded;
                }
            }
        } catch (\Throwable) {
        }
        return [];
    }
}
