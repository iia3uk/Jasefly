<?php
declare(strict_types=1);

namespace App\Platform\Access\Acl;

use App\Database;

final class AclAuditLogger
{
    public function __construct(private Database $db) {}

    /**
     * @param array<string, mixed>|null $before
     * @param array<string, mixed>|null $after
     */
    public function log(
        ?int $actorUserId,
        string $action,
        ?string $targetType = null,
        string|int|null $targetId = null,
        ?array $before = null,
        ?array $after = null,
        ?string $ip = null,
        ?string $requestId = null,
    ): void {
        try {
            $this->db->run(
                'INSERT INTO access_audit_log
                 (actor_user_id, action, target_type, target_id, before_json, after_json, ip_address, request_id, created_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)',
                [
                    $actorUserId,
                    $action,
                    $targetType,
                    $targetId !== null ? (string) $targetId : null,
                    $before !== null ? json_encode($before, JSON_UNESCAPED_UNICODE) : null,
                    $after !== null ? json_encode($after, JSON_UNESCAPED_UNICODE) : null,
                    $ip,
                    $requestId,
                ]
            );
        } catch (\Throwable) {
            // Never break request on audit failure.
        }
    }
}
