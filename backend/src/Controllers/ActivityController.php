<?php
declare(strict_types=1);

namespace App\Controllers;

use App\Request;
use App\Response;
use App\Services\ActivityLogService;
use App\Services\PermissionService;

final class ActivityController
{
    public function __construct(
        private ActivityLogService $activity,
        private PermissionService $permissions,
    ) {}

    public function index(Request $r): never
    {
        $user = $r->user ?? [];
        $this->permissions->require($user, 'activity.view');

        $limit = min(200, max(1, (int) $r->query('limit', 100)));
        $offset = max(0, (int) $r->query('offset', 0));
        $source = strtolower(trim((string) $r->query('source', 'all')));
        if (!in_array($source, ['all', 'admin', 'mcp'], true)) {
            $source = 'all';
        }

        $canMcpFeed = $this->canViewMcpFeed($user);
        if ($source === 'mcp' && !$canMcpFeed) {
            Response::error('Forbidden: insufficient permissions', 403, [], [
                'code' => 'forbidden',
                'capability' => 'mcp.manage',
            ]);
        }
        // Global feed without MCP privilege must not include machine-agent rows.
        if ($source === 'all' && !$canMcpFeed) {
            $source = 'admin';
        }

        Response::json([
            'data' => $this->activity->list($limit, $offset, $source === 'all' ? null : $source),
            'meta' => [
                'limit' => $limit,
                'offset' => $offset,
                'source' => $source,
                'mcp_included' => $canMcpFeed && in_array($source, ['all', 'mcp'], true),
            ],
        ]);
    }

    /** MCP activity is privileged (mcp.manage / system.manage / machine token). */
    private function canViewMcpFeed(array $user): bool
    {
        if (($user['auth'] ?? '') === 'mcp_token') {
            return true;
        }
        return $this->permissions->can($user, 'mcp.manage')
            || $this->permissions->can($user, 'system.manage');
    }
}
