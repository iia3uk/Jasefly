<?php
declare(strict_types=1);

namespace App\PackageModules\Newsletter;

use App\Platform\Contracts\PlatformDatabaseInterface;
use App\Platform\Contracts\PlatformMailInterface;
use App\Platform\Contracts\PlatformSchedulerInterface;

/**
 * Newsletter domain — Platform DB + Mail + Scheduler only (no direct scheduler registry / concrete mailer).
 */
final class NewsletterService
{
    public function __construct(
        private PlatformDatabaseInterface $db,
        private PlatformMailInterface $mail,
        private PlatformSchedulerInterface $scheduler,
        private string $jwtSecret,
        private string $baseUrl,
    ) {}

    public function subscribe(string $email, string $name = '', ?int $listId = null, string $source = 'website'): array
    {
        $email = strtolower(trim($email));
        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
            throw new \InvalidArgumentException('Invalid email');
        }
        if ($this->db->one('SELECT email FROM suppression_list WHERE email=?', [$email])) {
            throw new \RuntimeException('Address is suppressed');
        }
        $token = bin2hex(random_bytes(32));
        $existing = $this->db->one('SELECT * FROM subscribers WHERE email=?', [$email]);
        if ($existing) {
            $id = (int) $existing['id'];
            if ($existing['status'] !== 'active') {
                $this->db->run(
                    "UPDATE subscribers SET name=?,status='pending',source=?,confirm_token_hash=?,unsubscribed_at=NULL WHERE id=?",
                    [$name, $source, hash('sha256', $token), $id]
                );
            } else {
                $token = '';
            }
        } else {
            $this->db->run(
                "INSERT INTO subscribers (email,name,status,source,confirm_token_hash) VALUES (?,?,'pending',?,?)",
                [$email, $name, $source, hash('sha256', $token)]
            );
            $id = (int) $this->db->lastInsertId();
        }
        if ($listId) {
            $this->db->run(
                'INSERT IGNORE INTO subscriber_list_members (list_id,subscriber_id) VALUES (?,?)',
                [$listId, $id]
            );
        }
        if ($token !== '') {
            $this->sendConfirmation($email, $token);
        }
        $fresh = $this->db->one('SELECT status FROM subscribers WHERE id=?', [$id]);
        return ['id' => $id, 'status' => (string) ($fresh['status'] ?? 'pending')];
    }

    public function confirm(string $token): bool
    {
        if (!preg_match('/^[a-f0-9]{64}$/', $token)) {
            return false;
        }
        $row = $this->db->one('SELECT id FROM subscribers WHERE confirm_token_hash=?', [hash('sha256', $token)]);
        if (!$row) {
            return false;
        }
        $this->db->run(
            "UPDATE subscribers SET status='active',confirmed_at=NOW(),confirm_token_hash=NULL WHERE id=?",
            [(int) $row['id']]
        );
        return true;
    }

    public function unsubscribe(string $token): bool
    {
        $parts = explode('.', $token);
        if (count($parts) !== 3) {
            return false;
        }
        [$id, $expires, $signature] = $parts;
        if (!ctype_digit($id) || !ctype_digit($expires) || (int) $expires < time()) {
            return false;
        }
        $expected = hash_hmac('sha256', $id . '.' . $expires, $this->secret());
        if (!hash_equals($expected, $signature)) {
            return false;
        }
        $existing = $this->db->one('SELECT id FROM subscribers WHERE id=?', [(int) $id]);
        if (!$existing) {
            return false;
        }
        $this->db->run(
            "UPDATE subscribers SET status='unsubscribed',unsubscribed_at=NOW() WHERE id=?",
            [(int) $id]
        );
        return true;
    }

    public function unsubscribeToken(int $subscriberId, int $ttl = 31536000): string
    {
        $expires = time() + $ttl;
        $base = $subscriberId . '.' . $expires;
        return $base . '.' . hash_hmac('sha256', $base, $this->secret());
    }

    public function importCsv(string $csv, ?int $listId = null, string $source = 'import'): array
    {
        $lines = preg_split('/\r\n|\r|\n/', trim($csv)) ?: [];
        $headers = $lines ? array_map('trim', str_getcsv((string) array_shift($lines))) : [];
        $count = 0;
        $errors = [];
        foreach ($lines as $line => $raw) {
            if (trim($raw) === '') {
                continue;
            }
            $values = str_getcsv($raw);
            $row = array_combine($headers, array_pad($values, count($headers), ''));
            if ($row === false) {
                $errors[] = ['line' => $line + 2, 'error' => 'Invalid CSV row'];
                continue;
            }
            try {
                $this->subscribe((string) ($row['email'] ?? ''), (string) ($row['name'] ?? ''), $listId, $source);
                $count++;
            } catch (\Throwable $e) {
                $errors[] = ['line' => $line + 2, 'error' => $e->getMessage()];
            }
        }
        return ['imported' => $count, 'errors' => $errors];
    }

    public function exportCsv(?int $listId = null): string
    {
        $sql = 'SELECT s.email,s.name,s.status,s.source,s.confirmed_at,s.created_at FROM subscribers s';
        $params = [];
        if ($listId) {
            $sql .= ' JOIN subscriber_list_members m ON m.subscriber_id=s.id WHERE m.list_id=?';
            $params[] = $listId;
        }
        $rows = $this->db->all($sql . ' ORDER BY s.id DESC', $params);
        return CsvExport::build(
            ['email', 'name', 'status', 'source', 'confirmed_at', 'created_at'],
            array_map(static fn(array $r) => array_values($r), $rows)
        );
    }

    public function scheduleCampaign(int $campaignId, ?\DateTimeInterface $at = null): int
    {
        $when = $at ?? new \DateTimeImmutable('now');
        $this->db->run(
            "UPDATE newsletter_campaigns SET status='scheduled',scheduled_at=? WHERE id=?",
            [$when->format('Y-m-d H:i:s'), $campaignId]
        );
        $delay = max(0, $when->getTimestamp() - time());
        return $this->scheduler->enqueueEx(
            'campaign.send',
            ['campaign_id' => $campaignId],
            $delay,
            'newsletter',
            0,
            5,
            'campaign-' . $campaignId
        );
    }

    public function sendCampaign(int $campaignId, int $offset = 0, int $batch = 100): void
    {
        $campaign = $this->db->one('SELECT * FROM newsletter_campaigns WHERE id=?', [$campaignId]);
        if (!$campaign || $campaign['status'] === 'paused') {
            return;
        }
        if (!$this->mail->isAvailable()) {
            throw new \RuntimeException('Mail capability unavailable');
        }
        $sql = "SELECT s.* FROM subscribers s
                LEFT JOIN suppression_list x ON x.email=s.email";
        $params = [];
        if (!empty($campaign['list_id'])) {
            $sql .= ' JOIN subscriber_list_members m ON m.subscriber_id=s.id AND m.list_id=?';
            $params[] = (int) $campaign['list_id'];
        }
        $sql .= " WHERE s.status='active' AND x.email IS NULL ORDER BY s.id LIMIT " . (int) $batch . ' OFFSET ' . (int) $offset;
        $subscribers = $this->db->all($sql, $params);
        $this->db->run("UPDATE newsletter_campaigns SET status='sending' WHERE id=?", [$campaignId]);
        foreach ($subscribers as $subscriber) {
            $this->sendOne($campaign, $subscriber);
        }
        if (count($subscribers) === $batch) {
            $this->scheduler->enqueueEx(
                'campaign.send',
                ['campaign_id' => $campaignId, 'offset' => $offset + $batch],
                2,
                'newsletter',
                0,
                5,
                'campaign-' . $campaignId . '-' . ($offset + $batch)
            );
        } else {
            $this->db->run("UPDATE newsletter_campaigns SET status='sent' WHERE id=?", [$campaignId]);
        }
    }

    public function sendTest(int $campaignId, string $email): void
    {
        $campaign = $this->db->one('SELECT * FROM newsletter_campaigns WHERE id=?', [$campaignId]);
        if (!$campaign || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
            throw new \InvalidArgumentException('Invalid test');
        }
        $this->sendMail($email, (string) $campaign['subject'], (string) $campaign['html'], (string) ($campaign['text_body'] ?? ''));
    }

    /** @param array<string, mixed> $campaign @param array<string, mixed> $subscriber */
    private function sendOne(array $campaign, array $subscriber): void
    {
        try {
            $unsubscribe = rtrim($this->baseUrl, '/') . '/api/v1/newsletter/unsubscribe?token=' .
                rawurlencode($this->unsubscribeToken((int) $subscriber['id']));
            $html = str_replace(
                ['{{name}}', '{{email}}', '{{unsubscribe_url}}'],
                [
                    htmlspecialchars((string) ($subscriber['name'] ?? ''), ENT_QUOTES),
                    htmlspecialchars((string) $subscriber['email'], ENT_QUOTES),
                    $unsubscribe,
                ],
                (string) $campaign['html']
            );
            $this->sendMail((string) $subscriber['email'], (string) $campaign['subject'], $html, (string) ($campaign['text_body'] ?? ''));
            $this->db->run(
                "INSERT INTO newsletter_deliveries (campaign_id,subscriber_id,status,sent_at) VALUES (?,?,'sent',NOW())
                 ON DUPLICATE KEY UPDATE status='sent',sent_at=NOW(),error=NULL",
                [(int) $campaign['id'], (int) $subscriber['id']]
            );
            $this->db->run('UPDATE newsletter_campaigns SET sent_count=sent_count+1 WHERE id=?', [(int) $campaign['id']]);
        } catch (\Throwable $e) {
            $this->db->run(
                "INSERT INTO newsletter_deliveries (campaign_id,subscriber_id,status,error) VALUES (?,?,'failed',?)
                 ON DUPLICATE KEY UPDATE status='failed',error=VALUES(error)",
                [(int) $campaign['id'], (int) $subscriber['id'], $e->getMessage()]
            );
        }
    }

    private function sendConfirmation(string $email, string $token): void
    {
        if (!$this->mail->isAvailable()) {
            return;
        }
        $url = rtrim($this->baseUrl, '/') . '/api/v1/newsletter/confirm?token=' . rawurlencode($token);
        $html = '<p>Подтвердите подписку:</p><p><a href="' . htmlspecialchars($url, ENT_QUOTES) . '">Подтвердить</a></p>';
        $this->sendMail($email, 'Подтверждение подписки', $html, "Подтвердите подписку: {$url}");
    }

    private function sendMail(string $to, string $subject, string $html, string $text): void
    {
        if (!$this->mail->isAvailable()) {
            throw new \RuntimeException('Mail capability unavailable');
        }
        $result = $this->mail->sendHtml($to, $subject, $html, $text !== '' ? $text : null);
        if (!($result['ok'] ?? false)) {
            throw new \RuntimeException((string) ($result['error'] ?? 'Mail send failed'));
        }
    }

    private function secret(): string
    {
        $secret = $this->jwtSecret;
        if ($secret === '') {
            $secret = (string) (getenv('APP_KEY') ?: getenv('JWT_SECRET') ?: '');
        }
        if ($secret === '') {
            throw new \RuntimeException('Newsletter signing secret is not configured');
        }
        return $secret;
    }
}
