<?php
declare(strict_types=1);

namespace App\Controllers;

use App\Database;
use App\Request;
use App\Response;
use App\Services\ActivityLogService;
use App\Services\SoftDeleteService;

final class TrashController
{
    public function __construct(
        private Database $db,
        private SoftDeleteService $softDelete,
        private ActivityLogService $activity
    ) {}

    public function index(Request $r): never
    {
        Response::json(['data' => $this->softDelete->allTrash()]);
    }

    public function restore(Request $r, string $resource, string $id): never
    {
        $table = $this->softDelete->table($resource);
        if (!$table) {
            Response::error('Resource not trashable', 422);
        }
        $row = $this->db->one("SELECT * FROM `$table` WHERE id=?", [$id]);
        if (!$row) {
            Response::error('Not found', 404);
        }
        if (!$this->softDelete->restore($table, (int) $id)) {
            Response::error('Resource does not support trash restore', 422);
        }
        $this->activity->log($r, 'restore', $resource, (int) $id, $row['title'] ?? $row['name'] ?? null);
        Response::json(['message' => 'Restored', 'data' => ['id' => (int) $id, 'resource' => $resource]]);
    }

    public function forceDelete(Request $r, string $resource, string $id): never
    {
        if (!$r->input('confirm')) {
            Response::error('Permanent deletion requires confirm=true', 422);
        }
        $table = $this->softDelete->table($resource);
        if (!$table) {
            Response::error('Resource not trashable', 422);
        }
        $row = $this->db->one("SELECT * FROM `$table` WHERE id=?", [$id]);
        if (!$row) {
            Response::error('Not found', 404);
        }
        $this->softDelete->forceDelete($table, (int) $id);
        $this->activity->log($r, 'force_delete', $resource, (int) $id, $row['title'] ?? $row['name'] ?? null);
        Response::json(['message' => 'Permanently deleted']);
    }

    public function emptyTrash(Request $r, string $resource): never
    {
        if (!$r->input('confirm')) {
            Response::error('Empty trash requires confirm=true', 422);
        }
        $table = $this->softDelete->table($resource);
        if (!$table) {
            Response::error('Resource not trashable', 422);
        }
        $count = $this->softDelete->emptyTrash($table);
        $this->activity->log($r, 'empty_trash', $resource, null, null, ['count' => $count]);
        Response::json(['message' => 'Trash emptied', 'data' => ['deleted' => $count]]);
    }

    public function emptyAll(Request $r): never
    {
        if (!$r->input('confirm')) {
            Response::error('Empty all trash requires confirm=true', 422);
        }
        $total = 0;
        foreach (SoftDeleteService::TRASHABLE as $resource => $table) {
            $total += $this->softDelete->emptyTrash($table);
        }
        $this->activity->log($r, 'empty_trash', 'all', null, null, ['count' => $total]);
        Response::json(['message' => 'All trash emptied', 'data' => ['deleted' => $total]]);
    }
}
