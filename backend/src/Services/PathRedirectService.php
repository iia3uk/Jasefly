<?php
declare(strict_types=1);

namespace App\Services;

use App\Database;
use App\Response;
use Throwable;

/**
 * Manual from→to path redirects (301/302).
 */
final class PathRedirectService
{
    public function __construct(private Database $db) {}

    public static function normalize(string $path): string
    {
        $path = trim($path);
        if ($path === '') {
            return '/';
        }
        // Absolute external URLs are only valid as targets, not sources.
        if (preg_match('#^https?://#i', $path)) {
            return $path;
        }
        $path = '/' . ltrim(str_replace('\\', '/', $path), '/');
        if ($path !== '/') {
            $path = rtrim($path, '/');
        }
        return $path === '' ? '/' : $path;
    }

    /** @return list<array<string, mixed>> */
    public function listAll(): array
    {
        try {
            return $this->db->all('SELECT * FROM path_redirects ORDER BY id DESC');
        } catch (Throwable) {
            return [];
        }
    }

    /** @return array{to_path:string,status_code:int}|null */
    public function resolve(string $path): ?array
    {
        $from = self::normalize($path);
        try {
            $row = $this->db->one(
                'SELECT to_path, status_code FROM path_redirects WHERE from_path=? AND is_active=1 LIMIT 1',
                [$from]
            );
            if (!$row) {
                // Also try without leading slash stored incorrectly
                $alt = ltrim($from, '/');
                if ($alt !== '' && $alt !== $from) {
                    $row = $this->db->one(
                        'SELECT to_path, status_code FROM path_redirects WHERE from_path=? AND is_active=1 LIMIT 1',
                        [$alt]
                    );
                }
            }
            if (!$row) {
                return null;
            }
            $code = (int) ($row['status_code'] ?? 301);
            if (!in_array($code, [301, 302], true)) {
                $code = 301;
            }
            return [
                'to_path' => (string) $row['to_path'],
                'status_code' => $code,
            ];
        } catch (Throwable) {
            return null;
        }
    }

    /** Emit HTTP redirect + JSON envelope for SPA fetch clients. */
    public function redirectOrPass(string $path): void
    {
        $hit = $this->resolve($path);
        if (!$hit) {
            return;
        }
        $location = $hit['to_path'];
        if (!preg_match('#^https?://#i', $location)) {
            $location = self::normalize($location);
        }
        header('Location: ' . $location, true, $hit['status_code']);
        Response::json([
            'success' => true,
            'data' => [
                'redirect' => $location,
                'status' => $hit['status_code'],
            ],
        ], $hit['status_code']);
    }

    /**
     * @param array{from_path:string,to_path:string,status_code?:int,is_active?:int|bool,note?:?string} $data
     * @return array<string, mixed>
     */
    public function create(array $data): array
    {
        $from = self::normalize((string) ($data['from_path'] ?? ''));
        $to = trim((string) ($data['to_path'] ?? ''));
        if ($to === '') {
            Response::error('Укажите путь назначения', 422);
        }
        if (!preg_match('#^https?://#i', $to)) {
            $to = self::normalize($to);
        }
        if ($from === $to) {
            Response::error('Источник и назначение совпадают', 422);
        }
        $code = (int) ($data['status_code'] ?? 301);
        if (!in_array($code, [301, 302], true)) {
            $code = 301;
        }
        $active = array_key_exists('is_active', $data) ? (!empty($data['is_active']) ? 1 : 0) : 1;
        $note = isset($data['note']) ? mb_substr(trim((string) $data['note']), 0, 255) : null;

        $existing = $this->db->one('SELECT id FROM path_redirects WHERE from_path=?', [$from]);
        if ($existing) {
            Response::error('Редирект с этого пути уже есть', 422);
        }

        $this->db->run(
            'INSERT INTO path_redirects(from_path, to_path, status_code, is_active, note) VALUES(?,?,?,?,?)',
            [$from, $to, $code, $active, $note]
        );
        $id = (int) $this->db->id();
        return $this->db->one('SELECT * FROM path_redirects WHERE id=?', [$id]) ?: [];
    }

    /**
     * @param array{from_path?:string,to_path?:string,status_code?:int,is_active?:int|bool,note?:?string} $data
     * @return array<string, mixed>
     */
    public function update(int $id, array $data): array
    {
        $row = $this->db->one('SELECT * FROM path_redirects WHERE id=?', [$id]);
        if (!$row) {
            Response::error('Not found', 404);
        }
        $from = array_key_exists('from_path', $data)
            ? self::normalize((string) $data['from_path'])
            : (string) $row['from_path'];
        $to = array_key_exists('to_path', $data)
            ? trim((string) $data['to_path'])
            : (string) $row['to_path'];
        if ($to === '') {
            Response::error('Укажите путь назначения', 422);
        }
        if (!preg_match('#^https?://#i', $to)) {
            $to = self::normalize($to);
        }
        $code = array_key_exists('status_code', $data)
            ? (int) $data['status_code']
            : (int) $row['status_code'];
        if (!in_array($code, [301, 302], true)) {
            $code = 301;
        }
        $active = array_key_exists('is_active', $data)
            ? (!empty($data['is_active']) ? 1 : 0)
            : (int) $row['is_active'];
        $note = array_key_exists('note', $data)
            ? ($data['note'] !== null && $data['note'] !== '' ? mb_substr(trim((string) $data['note']), 0, 255) : null)
            : ($row['note'] ?? null);

        $dup = $this->db->one('SELECT id FROM path_redirects WHERE from_path=? AND id<>?', [$from, $id]);
        if ($dup) {
            Response::error('Редирект с этого пути уже есть', 422);
        }

        $this->db->run(
            'UPDATE path_redirects SET from_path=?, to_path=?, status_code=?, is_active=?, note=? WHERE id=?',
            [$from, $to, $code, $active, $note, $id]
        );
        return $this->db->one('SELECT * FROM path_redirects WHERE id=?', [$id]) ?: [];
    }

    public function delete(int $id): void
    {
        $this->db->run('DELETE FROM path_redirects WHERE id=?', [$id]);
    }
}
