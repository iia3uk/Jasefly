<?php
declare(strict_types=1);

namespace App\Services;

use App\Database;
use App\Request;

final class ActivityLogService
{
    public function __construct(private Database $db) {}

    public function log(
        Request $request,
        string $action,
        ?string $entityType = null,
        ?int $entityId = null,
        ?string $entityLabel = null,
        ?array $metadata = null
    ): void {
        try {
            $user = $request->user ?? [];
            $isMcp = ($user['auth'] ?? '') === 'mcp_token'
                || strcasecmp((string) ($user['name'] ?? ''), 'MCP Agent') === 0;
            $source = $isMcp ? 'mcp' : 'admin';

            $userId = $user['sub'] ?? null;
            // (int) null === 0 and breaks FK users(id) — keep NULL for MCP agent
            if ($userId === null || $userId === '' || $userId === 0 || $userId === '0') {
                $userId = null;
            } else {
                $userId = (int) $userId;
            }

            $meta = is_array($metadata) ? $metadata : [];
            $meta['source'] = $source;
            if ($isMcp) {
                $meta['auth'] = 'mcp_token';
            }

            $hasSourceCol = $this->hasSourceColumn();
            if ($hasSourceCol) {
                $this->db->run(
                    'INSERT INTO activity_logs(user_id, user_name, source, action, entity_type, entity_id, entity_label, metadata, ip_address)
                     VALUES(?,?,?,?,?,?,?,?,?)',
                    [
                        $userId,
                        $user['name'] ?? ($isMcp ? 'MCP Agent' : null),
                        $source,
                        $action,
                        $entityType,
                        $entityId,
                        $entityLabel,
                        json_encode($meta, JSON_UNESCAPED_UNICODE),
                        $request->ip(),
                    ]
                );
            } else {
                $this->db->run(
                    'INSERT INTO activity_logs(user_id, user_name, action, entity_type, entity_id, entity_label, metadata, ip_address)
                     VALUES(?,?,?,?,?,?,?,?)',
                    [
                        $userId,
                        $user['name'] ?? ($isMcp ? 'MCP Agent' : null),
                        $action,
                        $entityType,
                        $entityId,
                        $entityLabel,
                        json_encode($meta, JSON_UNESCAPED_UNICODE),
                        $request->ip(),
                    ]
                );
            }
        } catch (\Throwable) {
            // Activity log must never break create/update (missing table / migrations).
        }
    }

    /**
     * @return list<array<string, mixed>>
     */
    public function list(int $limit = 100, int $offset = 0, ?string $source = null): array
    {
        $limit = max(1, min(200, $limit));
        $offset = max(0, $offset);
        $source = $source !== null && $source !== '' && $source !== 'all' ? strtolower($source) : null;

        if ($source && $this->hasSourceColumn()) {
            return $this->db->all(
                'SELECT * FROM activity_logs WHERE source=? ORDER BY id DESC LIMIT ? OFFSET ?',
                [$source, $limit, $offset]
            );
        }

        if ($source === 'mcp') {
            // Fallback before migration: MCP Agent name / metadata
            return $this->db->all(
                "SELECT * FROM activity_logs
                 WHERE user_name = 'MCP Agent'
                    OR JSON_UNQUOTE(JSON_EXTRACT(metadata, '$.source')) = 'mcp'
                    OR JSON_UNQUOTE(JSON_EXTRACT(metadata, '$.auth')) = 'mcp_token'
                 ORDER BY id DESC LIMIT ? OFFSET ?",
                [$limit, $offset]
            );
        }

        if ($source === 'admin') {
            return $this->db->all(
                "SELECT * FROM activity_logs
                 WHERE (user_name IS NULL OR user_name <> 'MCP Agent')
                   AND (metadata IS NULL OR JSON_UNQUOTE(JSON_EXTRACT(metadata, '$.source')) IS NULL
                        OR JSON_UNQUOTE(JSON_EXTRACT(metadata, '$.source')) <> 'mcp')
                 ORDER BY id DESC LIMIT ? OFFSET ?",
                [$limit, $offset]
            );
        }

        return $this->db->all(
            'SELECT * FROM activity_logs ORDER BY id DESC LIMIT ? OFFSET ?',
            [$limit, $offset]
        );
    }

    private function hasSourceColumn(): bool
    {
        static $cached = null;
        if ($cached !== null) {
            return $cached;
        }
        try {
            $cached = $this->db->inspector()->columnExists('activity_logs', 'source');
        } catch (\Throwable) {
            $cached = false;
        }
        return $cached;
    }
}
