<?php
declare(strict_types=1);

namespace App\Controllers;

use App\Database;
use App\Jwt;
use App\Request;
use App\Response;
use App\Services\ActivityLogService;
use App\Services\MediaService;
use App\Services\MediaUsageService;
use App\Services\SoftDeleteService;
use App\Support\AuthCookie;
use App\Utils\Str;

final class MediaController
{
    private MediaService $media;
    private SoftDeleteService $softDelete;
    private ActivityLogService $activity;

    public function __construct(private Database $db, private array $app)
    {
        $this->media = new MediaService($db, $app);
        $this->softDelete = new SoftDeleteService($db);
        $this->activity = new ActivityLogService($db);
    }

    public function stream(Request $r, string $id): never
    {
        $allowPrivate = $this->isStaffRequest($r);
        $this->media->stream((int) $id, $allowPrivate);
    }

    private function isStaffRequest(Request $r): bool
    {
        $token = $r->bearer() ?: AuthCookie::token();
        if ($token === null || $token === '') {
            return false;
        }
        try {
            $payload = Jwt::decode($token, (string) ($this->app['jwt_secret'] ?? ''));
            if (($payload['type'] ?? '') !== 'access') {
                return false;
            }
            return MediaUsageService::isStaffRole(isset($payload['role']) ? (string) $payload['role'] : null);
        } catch (\Throwable) {
            return false;
        }
    }

    public function index(Request $r): never
    {
        $q = trim((string) $r->query('q', ''));
        $folderId = $r->query('folder_id');
        $trash = $r->query('trash') === '1';
        $sql = 'SELECT * FROM media WHERE 1=1';
        $params = [];

        if ($trash) {
            $sql .= ' AND deleted_at IS NOT NULL';
        } else {
            $sql .= ' AND deleted_at IS NULL';
        }

        if ($folderId !== null && $folderId !== '') {
            if ($folderId === 'root' || $folderId === '0' || $folderId === 'uncategorized') {
                $sql .= ' AND folder_id IS NULL';
            } else {
                $sql .= ' AND folder_id=?';
                $params[] = (int) $folderId;
            }
        }
        if ($q !== '') {
            $sql .= ' AND (original_name LIKE ? OR alt_text LIKE ? OR filename LIKE ? OR caption LIKE ?)';
            $params[] = "%$q%";
            $params[] = "%$q%";
            $params[] = "%$q%";
            $params[] = "%$q%";
        }
        $sql .= ' ORDER BY id DESC';
        $rows = $this->db->all($sql, $params);
        foreach ($rows as &$row) {
            $row = $this->media->withDiskStatus($row);
        }
        unset($row);
        Response::json(['data' => $rows]);
    }

    public function unused(Request $r): never
    {
        Response::json(['data' => (new MediaUsageService($this->db))->unused()]);
    }

    public function missing(Request $r): never
    {
        Response::json(['data' => $this->media->findMissing(true)]);
    }

    public function purgeMissing(Request $r): never
    {
        $result = $this->media->purgeMissing();
        $this->activity->log($r, 'force_delete', 'media', null, 'purge missing files', $result);
        Response::json(['message' => 'Purged missing media', 'data' => $result]);
    }

    public function upload(Request $r): never
    {
        try {
            $folderId = $r->input('folder_id');
            $row = $this->media->upload(
                $r->file('file') ?? [],
                $folderId !== null && $folderId !== '' ? (int) $folderId : null,
                $r->input('alt_text'),
                $r->input('caption')
            );
            $this->activity->log($r, 'create', 'media', (int) $row['id'], $row['original_name'] ?? null);
            Response::json(['data' => $row], 201);
        } catch (\Throwable $e) {
            Response::error($e->getMessage(), 422);
        }
    }

    public function replace(Request $r, string $id): never
    {
        try {
            $row = $this->media->replace((int) $id, $r->file('file') ?? [], $r->input('alt_text'), $r->input('caption'));
            $this->activity->log($r, 'update', 'media', (int) $id, $row['original_name'] ?? null, ['replaced' => true]);
            Response::json(['data' => $row]);
        } catch (\Throwable $e) {
            Response::error($e->getMessage(), 422);
        }
    }

    public function delete(Request $r, string $id): never
    {
        $row = $this->db->one('SELECT * FROM media WHERE id=?', [$id]);
        if (!$row) {
            Response::error('Not found', 404);
        }
        // Always remove physical files + DB row
        $this->media->delete((int) $id);
        $this->activity->log($r, 'force_delete', 'media', (int) $id, $row['original_name'] ?? null);
        Response::json(['message' => 'Deleted from hosting', 'data' => ['mode' => 'deleted']]);
    }

    public function folders(Request $r): never
    {
        Response::json(['data' => $this->db->all('SELECT * FROM media_folders ORDER BY name')]);
    }

    public function update(Request $r, string $id): never
    {
        $row = $this->db->one('SELECT * FROM media WHERE id=? AND deleted_at IS NULL', [$id]);
        if (!$row) {
            Response::error('Not found', 404);
        }
        $folderId = $r->input('folder_id');
        $alt = $r->input('alt_text');
        $caption = $r->input('caption');
        $sets = [];
        $params = [];
        if (array_key_exists('folder_id', $r->all())) {
            $sets[] = 'folder_id=?';
            $params[] = $folderId === null || $folderId === '' ? null : (int) $folderId;
        }
        if ($alt !== null) {
            $sets[] = 'alt_text=?';
            $params[] = $alt;
        }
        if ($caption !== null) {
            $sets[] = 'caption=?';
            $params[] = $caption;
        }
        if (!$sets) {
            Response::error('No changes', 422);
        }
        $params[] = $id;
        $this->db->run('UPDATE media SET ' . implode(',', $sets) . ' WHERE id=?', $params);
        $this->activity->log($r, 'update', 'media', (int) $id, $row['original_name'] ?? null);
        Response::json(['data' => $this->db->one('SELECT * FROM media WHERE id=?', [$id])]);
    }

    public function folderCreate(Request $r): never
    {
        $name = trim((string) $r->input('name'));
        if ($name === '') {
            Response::error('Name is required', 422);
        }
        $slug = Str::slug($name);
        if ($slug === '') {
            Response::error('Invalid folder name', 422);
        }
        $parent = $r->input('parent_id');
        $this->db->run(
            'INSERT INTO media_folders(name, parent_id, slug) VALUES(?,?,?)',
            [$name, $parent !== null && $parent !== '' ? (int) $parent : null, $slug]
        );
        try {
            $this->media->ensurePhysicalFolder($slug);
        } catch (\Throwable $e) {
            // DB folder still usable even if disk mkdir fails (shared hosting edge cases)
        }
        Response::json(['data' => $this->db->one('SELECT * FROM media_folders WHERE id=?', [$this->db->id()])], 201);
    }

    public function folderUpdate(Request $r, string $id): never
    {
        $name = trim((string) $r->input('name'));
        $parent = $r->input('parent_id');
        $this->db->run(
            'UPDATE media_folders SET name=?, parent_id=?, slug=? WHERE id=?',
            [$name, $parent !== null && $parent !== '' ? (int) $parent : null, Str::slug($name), $id]
        );
        Response::json(['data' => $this->db->one('SELECT * FROM media_folders WHERE id=?', [$id])]);
    }

    public function folderDelete(Request $r, string $id): never
    {
        $this->db->run('DELETE FROM media_folders WHERE id=?', [$id]);
        Response::json(['message' => 'Deleted']);
    }
}
