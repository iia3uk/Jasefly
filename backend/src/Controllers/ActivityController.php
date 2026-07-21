<?php
declare(strict_types=1);

namespace App\Controllers;

use App\Request;
use App\Response;
use App\Services\ActivityLogService;

final class ActivityController
{
    public function __construct(private ActivityLogService $activity) {}

    public function index(Request $r): never
    {
        $limit = min(200, max(1, (int) $r->query('limit', 100)));
        $offset = max(0, (int) $r->query('offset', 0));
        $source = strtolower(trim((string) $r->query('source', 'all')));
        if (!in_array($source, ['all', 'admin', 'mcp'], true)) {
            $source = 'all';
        }
        Response::json([
            'data' => $this->activity->list($limit, $offset, $source === 'all' ? null : $source),
            'meta' => [
                'limit' => $limit,
                'offset' => $offset,
                'source' => $source,
            ],
        ]);
    }
}
