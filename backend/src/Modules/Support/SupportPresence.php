<?php
declare(strict_types=1);

namespace App\Modules\Support;

use App\Database;

/**
 * Visitor + agent heartbeats. Online agents = seen within ~45s.
 */
final class SupportPresence
{
    public const AGENT_ONLINE_SECONDS = 45;
    public const VISITOR_TIMEOUT_SECONDS = 90;

    public function __construct(private Database $db) {}

    public function touchAgent(int $userId): void
    {
        if ($userId <= 0) {
            return;
        }
        $this->db->run(
            'INSERT INTO support_agent_presence (user_id, last_seen_at) VALUES (?, NOW())
             ON DUPLICATE KEY UPDATE last_seen_at = NOW()',
            [$userId]
        );
    }

    public function hasOnlineAgents(): bool
    {
        try {
            $row = $this->db->one(
                'SELECT COUNT(*) AS c FROM support_agent_presence
                 WHERE last_seen_at >= DATE_SUB(NOW(), INTERVAL ? SECOND)',
                [self::AGENT_ONLINE_SECONDS]
            );
            return ((int) ($row['c'] ?? 0)) > 0;
        } catch (\Throwable) {
            return false;
        }
    }

    /** @return list<array{user_id: int, last_seen_at: string}> */
    public function onlineAgents(): array
    {
        try {
            $rows = $this->db->all(
                'SELECT user_id, last_seen_at FROM support_agent_presence
                 WHERE last_seen_at >= DATE_SUB(NOW(), INTERVAL ? SECOND)
                 ORDER BY last_seen_at DESC',
                [self::AGENT_ONLINE_SECONDS]
            );
            return array_map(static fn(array $r): array => [
                'user_id' => (int) $r['user_id'],
                'last_seen_at' => (string) $r['last_seen_at'],
            ], $rows);
        } catch (\Throwable) {
            return [];
        }
    }

    public function touchVisitor(int $ticketId): void
    {
        $this->db->run(
            'UPDATE support_tickets SET last_visitor_seen_at = NOW(), updated_at = NOW() WHERE id = ?',
            [$ticketId]
        );
    }

    /**
     * Mark tickets without contact as awaiting_contact when visitor timed out.
     *
     * @return int number of tickets flipped
     */
    public function markAbandonedWithoutContact(): int
    {
        try {
            $this->db->run(
                "UPDATE support_tickets SET status = 'awaiting_contact', updated_at = NOW()
                 WHERE status IN ('open', 'waiting_agent', 'bot')
                   AND (contact_email IS NULL OR contact_email = '')
                   AND (contact_social IS NULL OR contact_social = '')
                   AND last_visitor_seen_at IS NOT NULL
                   AND last_visitor_seen_at < DATE_SUB(NOW(), INTERVAL ? SECOND)",
                [self::VISITOR_TIMEOUT_SECONDS]
            );
            return 1;
        } catch (\Throwable) {
            return 0;
        }
    }
}
