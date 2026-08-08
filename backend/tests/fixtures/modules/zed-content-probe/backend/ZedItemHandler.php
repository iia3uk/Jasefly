<?php
declare(strict_types=1);

namespace App\PackageModules\ZedContentProbe;

use App\Platform\Contracts\ContentResourceHandler;
use App\Platform\Contracts\PlatformDatabaseInterface;

final class ZedItemHandler implements ContentResourceHandler
{
    public function __construct(private PlatformDatabaseInterface $db) {}

    public function list(array $query): array
    {
        $items = $this->db->all('SELECT * FROM zed_items WHERE deleted_at IS NULL ORDER BY id DESC');
        return ['items' => $items, 'total' => count($items)];
    }

    public function get(int|string $idOrSlug, array $opts = []): ?array
    {
        $where = is_numeric($idOrSlug) ? 'id=?' : 'slug=?';
        return $this->db->one("SELECT * FROM zed_items WHERE {$where} AND deleted_at IS NULL", [$idOrSlug]);
    }

    public function create(array $data, ?array $user): array
    {
        $slug = trim((string) ($data['slug'] ?? ''));
        $title = trim((string) ($data['title'] ?? ''));
        if ($slug === '' || $title === '') {
            return ['ok' => false, 'code' => 'validation', 'error' => 'slug and title are required'];
        }
        $this->db->run(
            'INSERT INTO zed_items (slug, title, status, body) VALUES (?, ?, ?, ?)',
            [$slug, $title, (string) ($data['status'] ?? 'draft'), (string) ($data['body'] ?? '')]
        );
        return ['ok' => true, 'item' => $this->get($this->db->lastInsertId())];
    }

    public function update(int|string $id, array $data, ?array $user): array
    {
        $item = $this->get($id);
        if ($item === null) {
            return ['ok' => false, 'code' => 'not_found', 'error' => 'item not found'];
        }
        $this->db->run(
            'UPDATE zed_items SET slug=?, title=?, status=?, body=? WHERE id=?',
            [
                (string) ($data['slug'] ?? $item['slug']),
                (string) ($data['title'] ?? $item['title']),
                (string) ($data['status'] ?? $item['status']),
                (string) ($data['body'] ?? $item['body']),
                $id,
            ]
        );
        return ['ok' => true, 'item' => $this->get($id)];
    }

    public function delete(int|string $id, ?array $user): array
    {
        $this->db->run('UPDATE zed_items SET deleted_at=CURRENT_TIMESTAMP WHERE id=?', [$id]);
        return ['ok' => true];
    }

    public function publish(int|string $id, string $status, ?array $user): array
    {
        $this->db->run('UPDATE zed_items SET status=? WHERE id=?', [$status, $id]);
        return ['ok' => true, 'item' => $this->get($id)];
    }

    public function relations(int|string $id, string $relation): array
    {
        return $relation === 'tags'
            ? $this->db->all('SELECT tag FROM zed_item_tags WHERE item_id=? ORDER BY tag', [$id])
            : [];
    }

    public function replaceRelations(int|string $id, string $relation, array $rows, ?array $user): array
    {
        if ($relation !== 'tags') {
            return ['ok' => false, 'code' => 'unknown_relation', 'error' => 'unknown relation'];
        }
        $this->db->transaction(function () use ($id, $rows): void {
            $this->db->run('DELETE FROM zed_item_tags WHERE item_id=?', [$id]);
            foreach ($rows as $row) {
                $tag = is_array($row) ? (string) ($row['tag'] ?? '') : (string) $row;
                if ($tag !== '') {
                    $this->db->run('INSERT INTO zed_item_tags (item_id, tag) VALUES (?, ?)', [$id, $tag]);
                }
            }
        });
        return ['ok' => true, 'items' => $this->relations($id, 'tags')];
    }

    public function publicList(array $query): array
    {
        $items = $this->db->all("SELECT * FROM zed_items WHERE status='published' AND deleted_at IS NULL ORDER BY id DESC");
        return ['items' => $items, 'total' => count($items)];
    }

    public function publicGet(string $slug): ?array
    {
        return $this->db->one("SELECT * FROM zed_items WHERE slug=? AND status='published' AND deleted_at IS NULL", [$slug]);
    }
}
