<?php
declare(strict_types=1);

namespace App\PackageModules\Notifications;

use App\Platform\Contracts\PlatformDatabaseInterface;
use App\Platform\Contracts\PlatformHttpInterface;
use App\Platform\Contracts\PlatformMailInterface;

/**
 * Inbox + optional email/Telegram delivery via Platform Mail / HTTP only.
 */
final class NotificationInbox
{
    public function __construct(
        private PlatformDatabaseInterface $db,
        private PlatformMailInterface $mail,
        private PlatformHttpInterface $http,
    ) {}

    public function notifyAdmins(string $type, string $title, string $body, array $meta = []): int
    {
        return $this->create(null, $type, $title, $body, $meta);
    }

    public function create(?int $userId, string $type, string $title, string $body, array $meta = []): int
    {
        $dedupe = isset($meta['dedupe_key']) ? (string) $meta['dedupe_key'] : null;
        try {
            $this->db->run(
                'INSERT INTO notifications (user_id,type,title,body,action_url,icon,priority,dedupe_key) VALUES (?,?,?,?,?,?,?,?)',
                [
                    $userId, $type, $title, $body,
                    $meta['action_url'] ?? null, $meta['icon'] ?? null,
                    $meta['priority'] ?? 'normal', $dedupe,
                ]
            );
        } catch (\Throwable $e) {
            if ($dedupe) {
                $row = $this->db->one(
                    'SELECT id FROM notifications WHERE user_id <=> ? AND dedupe_key=?',
                    [$userId, $dedupe]
                );
                if ($row) {
                    return (int) $row['id'];
                }
            }
            throw $e;
        }
        $id = (int) $this->db->lastInsertId();
        $this->deliver($id, $userId, $type, $title, $body);
        return $id;
    }

    public function markRead(int $id, int $userId): bool
    {
        $row = $this->db->one(
            'SELECT id FROM notifications WHERE id=? AND (user_id=? OR user_id IS NULL)',
            [$id, $userId]
        );
        if (!$row) {
            return false;
        }
        $this->db->run(
            'UPDATE notifications SET is_read=1 WHERE id=? AND (user_id=? OR user_id IS NULL)',
            [$id, $userId]
        );
        return true;
    }

    public function markAllRead(int $userId): int
    {
        $row = $this->db->one(
            'SELECT COUNT(*) c FROM notifications WHERE is_read=0 AND (user_id=? OR user_id IS NULL)',
            [$userId]
        );
        $n = (int) ($row['c'] ?? 0);
        $this->db->run(
            'UPDATE notifications SET is_read=1 WHERE is_read=0 AND (user_id=? OR user_id IS NULL)',
            [$userId]
        );
        return $n;
    }

    private function deliver(int $notificationId, ?int $userId, string $type, string $title, string $body): void
    {
        $recipients = [];
        if ($userId !== null) {
            $row = $this->db->one('SELECT id,email FROM users WHERE id=?', [$userId]);
            if ($row) {
                $recipients[] = $row;
            }
        } else {
            $recipients = $this->db->all(
                "SELECT id,email FROM users WHERE role IN ('admin','super_admin')"
            );
        }
        foreach ($recipients as $recipient) {
            $uid = (int) $recipient['id'];
            if ($this->allowed($uid, 'email', $type)) {
                $this->deliverEmail($notificationId, (string) ($recipient['email'] ?? ''), $title, $body);
            }
            if ($this->allowed($uid, 'telegram', $type)) {
                $this->deliverTelegram($notificationId, $title . "\n" . $body);
            }
        }
    }

    private function allowed(int $userId, string $channel, string $type): bool
    {
        try {
            $pref = $this->db->one(
                'SELECT is_enabled,types FROM notification_preferences WHERE user_id=? AND channel=?',
                [$userId, $channel]
            );
        } catch (\Throwable) {
            return true;
        }
        if (!$pref) {
            return true;
        }
        if (!(bool) $pref['is_enabled']) {
            return false;
        }
        $types = json_decode((string) ($pref['types'] ?? '[]'), true);
        return !is_array($types) || $types === [] || in_array($type, $types, true);
    }

    private function deliverEmail(int $id, string $email, string $title, string $body): void
    {
        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
            return;
        }
        if (!$this->mail->isAvailable()) {
            return;
        }
        try {
            $html = nl2br(htmlspecialchars($body, ENT_QUOTES, 'UTF-8'));
            $result = $this->mail->sendHtml($email, $title, $html, $body);
            $this->delivery($id, 'email', $email, ($result['ok'] ?? false) ? 'sent' : 'failed', isset($result['error']) ? (string) $result['error'] : null);
        } catch (\Throwable $e) {
            $this->delivery($id, 'email', $email, 'failed', $e->getMessage());
        }
    }

    private function deliverTelegram(int $id, string $text): void
    {
        $settings = $this->pluginSettings('mail');
        $token = (string) ($settings['telegram_bot_token'] ?? '');
        $chat = (string) ($settings['telegram_chat_id'] ?? '');
        if ($token === '' || $chat === '') {
            return;
        }
        $url = 'https://api.telegram.org/bot' . $token . '/sendMessage';
        if (!$this->http->isSafeOutboundUrl($url)) {
            $this->delivery($id, 'telegram', $chat, 'failed', 'Unsafe Telegram URL');
            return;
        }
        try {
            $ok = $this->http->postJsonOutbound($url, ['chat_id' => $chat, 'text' => $text]);
            $this->delivery($id, 'telegram', $chat, $ok ? 'sent' : 'failed', $ok ? null : 'Telegram send failed');
        } catch (\Throwable $e) {
            $this->delivery($id, 'telegram', $chat, 'failed', $e->getMessage());
        }
    }

    private function delivery(int $id, string $channel, string $recipient, string $status, ?string $error = null): void
    {
        try {
            $this->db->run(
                'INSERT INTO notification_deliveries (notification_id,channel,recipient,status,error) VALUES (?,?,?,?,?)',
                [$id, $channel, $recipient, $status, $error]
            );
        } catch (\Throwable) {
        }
    }

    /** @return array<string, mixed> */
    private function pluginSettings(string $name): array
    {
        try {
            $row = $this->db->one('SELECT settings FROM modules WHERE name=?', [$name]);
            return $row ? (json_decode((string) ($row['settings'] ?? '{}'), true) ?: []) : [];
        } catch (\Throwable) {
            return [];
        }
    }
}
