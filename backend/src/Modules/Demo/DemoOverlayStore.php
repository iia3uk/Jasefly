<?php
declare(strict_types=1);

namespace App\Modules\Demo;

use App\Database;

final class DemoOverlayStore
{
    public const MAX_PAYLOAD_BYTES = 512_000;
    public const MAX_ROWS_PER_SESSION = 80;

    public function __construct(private Database $db) {}

    public function get(string $sessionId, string $type, string $key): ?array
    {
        $row = $this->db->one(
            'SELECT payload_json FROM demo_overlays WHERE session_id=? AND resource_type=? AND resource_key=?',
            [$sessionId, $type, $key]
        );
        if (!$row) {
            return null;
        }
        $data = json_decode((string) $row['payload_json'], true);
        return is_array($data) ? $data : null;
    }

    public function put(string $sessionId, string $type, string $key, array $payload): void
    {
        $json = json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        if ($json === false || strlen($json) > self::MAX_PAYLOAD_BYTES) {
            throw new \RuntimeException('Demo overlay payload too large');
        }
        $count = (int) ($this->db->one(
            'SELECT COUNT(*) AS c FROM demo_overlays WHERE session_id=?',
            [$sessionId]
        )['c'] ?? 0);
        $exists = $this->db->one(
            'SELECT id FROM demo_overlays WHERE session_id=? AND resource_type=? AND resource_key=?',
            [$sessionId, $type, $key]
        );
        if (!$exists && $count >= self::MAX_ROWS_PER_SESSION) {
            throw new \RuntimeException('Demo overlay limit reached');
        }
        if ($exists) {
            $this->db->run(
                'UPDATE demo_overlays SET payload_json=?, updated_at=CURRENT_TIMESTAMP WHERE id=?',
                [$json, $exists['id']]
            );
            return;
        }
        $this->db->run(
            'INSERT INTO demo_overlays(session_id, resource_type, resource_key, payload_json) VALUES(?,?,?,?)',
            [$sessionId, $type, $key, $json]
        );
    }

    public function deleteSession(string $sessionId): void
    {
        $this->db->run('DELETE FROM demo_overlays WHERE session_id=?', [$sessionId]);
    }

    /** @return list<array<string, mixed>> */
    public function listByType(string $sessionId, string $type): array
    {
        $rows = $this->db->all(
            'SELECT resource_key, payload_json FROM demo_overlays WHERE session_id=? AND resource_type=? ORDER BY resource_key',
            [$sessionId, $type]
        );
        $out = [];
        foreach ($rows as $row) {
            $data = json_decode((string) $row['payload_json'], true);
            if (is_array($data)) {
                $out[] = $data;
            }
        }
        return $out;
    }
}
