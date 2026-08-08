<?php
declare(strict_types=1);

namespace App\PackageModules\Forms;

use App\Platform\Contracts\PlatformDatabaseInterface;
use App\Platform\Contracts\PlatformEventsInterface;
use App\Platform\Contracts\PlatformHttpInterface;
use App\Platform\Contracts\PlatformMailInterface;
use App\Platform\Contracts\PlatformNotificationsInterface;

final class FormActionRegistry
{
    /** @var array<string, callable(PlatformDatabaseInterface, array, array, array): mixed> */
    private static array $handlers = [];

    private static ?PlatformMailInterface $mail = null;
    private static ?PlatformNotificationsInterface $notifications = null;
    private static ?PlatformHttpInterface $http = null;
    private static ?PlatformEventsInterface $events = null;

    public static function register(string $type, callable $handler): void
    {
        self::$handlers[$type] = $handler;
    }

    public static function bootDefaults(
        PlatformMailInterface $mail,
        PlatformNotificationsInterface $notifications,
        PlatformHttpInterface $http,
        PlatformDatabaseInterface $db,
        PlatformEventsInterface $events,
    ): void {
        self::$mail = $mail;
        self::$notifications = $notifications;
        self::$http = $http;
        self::$events = $events;

        self::register('save_submission', static function (PlatformDatabaseInterface $db, array $form, array $submission, array $config): void {
            // Already persisted before actions; keep as explicit no-op marker.
        });

        self::register('redirect', static function (PlatformDatabaseInterface $db, array $form, array $submission, array $config): array {
            $url = (string) ($config['url'] ?? $form['redirect_url'] ?? '');
            return ['redirect_url' => $url !== '' ? $url : null];
        });

        self::register('send_email', static function (PlatformDatabaseInterface $db, array $form, array $submission, array $config): void {
            try {
                if (self::$mail === null || !self::$mail->isAvailable()) {
                    return;
                }
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
                self::$mail?->sendHtml(
                    $to,
                    'Новая заявка: ' . $form['name'],
                    $html,
                    $body,
                );
            } catch (\Throwable) {
            }
        });

        self::register('send_telegram', static function (PlatformDatabaseInterface $db, array $form, array $submission, array $config): void {
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
                $url = 'https://api.telegram.org/bot' . $token . '/sendMessage';
                self::$http?->postJsonOutbound($url, [
                    'chat_id' => $chat,
                    'text' => $text,
                ]);
            } catch (\Throwable) {
            }
        });

        self::register('send_webhook', static function (PlatformDatabaseInterface $db, array $form, array $submission, array $config): void {
            $url = (string) ($config['url'] ?? '');
            if ($url === '') {
                return;
            }
            self::$http?->postJsonOutbound($url, [
                'event' => 'form.submitted',
                'form' => ['id' => $form['id'], 'slug' => $form['slug'], 'name' => $form['name']],
                'submission' => [
                    'public_id' => $submission['public_id'] ?? null,
                    'values' => $submission['values'] ?? [],
                ],
            ]);
        });

        self::register('create_notification', static function (PlatformDatabaseInterface $db, array $form, array $submission, array $config): void {
            try {
                if (self::$notifications === null || !self::$notifications->isAvailable()) {
                    return;
                }
                self::$notifications->notifyAdmins(
                    'form.submitted',
                    'Новая заявка: ' . $form['name'],
                    (string) ($submission['public_id'] ?? ''),
                    ['form_id' => $form['id'], 'submission_public_id' => $submission['public_id'] ?? null]
                );
            } catch (\Throwable) {
            }
        });

        self::register('start_automation', static function (PlatformDatabaseInterface $db, array $form, array $submission, array $config): void {
            // Event already dispatched; Automation listens to form.submitted.
        });

        self::register('subscribe', static function (PlatformDatabaseInterface $db, array $form, array $submission, array $config): void {
            $email = strtolower(trim((string) (($submission['values']['email'] ?? '') ?: '')));
            $name = trim((string) ($submission['values']['name'] ?? ''));
            $listId = (int) ($config['list_id'] ?? 0) ?: null;
            $source = 'form:' . ($form['slug'] ?? '');
            if ($email === '' || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
                return;
            }
            try {
                self::subscribeInline($db, $email, $name, $listId, $source);
            } catch (\Throwable) {
                try {
                    self::$events?->publish('newsletter.subscribe.requested', [
                        'email' => $email,
                        'name' => $name,
                        'list_id' => $listId,
                        'source' => $source,
                    ]);
                } catch (\Throwable) {
                }
            }
        });
    }

    /**
     * @param list<array<string, mixed>> $actions
     * @return array<string, mixed>
     */
    public static function runAll(PlatformDatabaseInterface $db, array $form, array $submission, array $actions): array
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

    /** @return array<string, mixed> */
    private static function mailPluginSettings(PlatformDatabaseInterface $db): array
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

    private static function subscribeInline(
        PlatformDatabaseInterface $db,
        string $email,
        string $name,
        ?int $listId,
        string $source,
    ): void {
        try {
            if ($db->one('SELECT email FROM suppression_list WHERE email=?', [$email])) {
                return;
            }
        } catch (\Throwable) {
            // suppression_list may be absent
        }
        $token = bin2hex(random_bytes(32));
        $existing = null;
        try {
            $existing = $db->one('SELECT * FROM subscribers WHERE email=?', [$email]);
        } catch (\Throwable $e) {
            throw $e;
        }
        if ($existing) {
            $id = (int) $existing['id'];
            if (($existing['status'] ?? '') !== 'active') {
                $db->run(
                    "UPDATE subscribers SET name=?,status='pending',source=?,confirm_token_hash=?,unsubscribed_at=NULL WHERE id=?",
                    [$name, $source, hash('sha256', $token), $id]
                );
            }
        } else {
            $db->run(
                "INSERT INTO subscribers (email,name,status,source,confirm_token_hash) VALUES (?,?,'pending',?,?)",
                [$email, $name, $source, hash('sha256', $token)]
            );
            $id = $db->lastInsertId();
        }
        if ($listId) {
            try {
                $db->run(
                    'INSERT IGNORE INTO subscriber_list_members (list_id,subscriber_id) VALUES (?,?)',
                    [$listId, $id]
                );
            } catch (\Throwable) {
            }
        }
    }
}
