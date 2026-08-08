<?php
declare(strict_types=1);

namespace App\PackageModules\Blog;

use App\Platform\Contracts\ContentResourceHandler;
use App\Platform\Contracts\PlatformDatabaseInterface;
use App\Utils\HtmlSanitizer;
use App\Utils\Str;

/**
 * Owns blog_posts persistence and its tag projection. It deliberately exposes
 * no host controller or table registry to callers.
 */
final class BlogResourceHandler implements ContentResourceHandler
{
    public function __construct(private PlatformDatabaseInterface $db) {}

    public function list(array $query): array
    {
        return ['items' => array_map(fn(array $row) => $this->enrich($row), $this->db->all(
            'SELECT * FROM blog_posts WHERE deleted_at IS NULL ORDER BY published_at DESC, id DESC'
        ))];
    }

    public function get(int|string $idOrSlug, array $opts = []): ?array
    {
        $field = is_numeric($idOrSlug) ? 'id' : 'slug';
        $row = $this->db->one("SELECT * FROM blog_posts WHERE {$field}=? AND deleted_at IS NULL", [$idOrSlug]);
        return $row ? $this->enrich($row, true) : null;
    }

    public function create(array $data, ?array $user): array
    {
        $values = $this->writable($data);
        if ($values === []) {
            return ['ok' => false, 'code' => 'validation', 'error' => 'No writable fields'];
        }
        $this->db->transaction(function () use ($values, $data): void {
            $columns = array_keys($values);
            $this->db->run(
                'INSERT INTO blog_posts (`' . implode('`,`', $columns) . '`) VALUES (' . implode(',', array_fill(0, count($columns), '?')) . ')',
                array_values($values)
            );
            $this->replaceTags($this->db->lastInsertId(), $data['tag_ids'] ?? $data['tags'] ?? null);
        });
        return ['ok' => true, 'data' => $this->get($this->db->lastInsertId())];
    }

    public function update(int|string $id, array $data, ?array $user): array
    {
        if (!$this->get($id)) {
            return ['ok' => false, 'code' => 'not_found', 'error' => 'Not found'];
        }
        $values = $this->writable($data);
        $this->db->transaction(function () use ($id, $values, $data): void {
            if ($values !== []) {
                $this->db->run(
                    'UPDATE blog_posts SET ' . implode(',', array_map(static fn($c) => "`{$c}`=?", array_keys($values))) . ' WHERE id=? AND deleted_at IS NULL',
                    array_merge(array_values($values), [(int) $id])
                );
            }
            if (array_key_exists('tag_ids', $data) || array_key_exists('tags', $data)) {
                $this->replaceTags((int) $id, $data['tag_ids'] ?? $data['tags']);
            }
        });
        return ['ok' => true, 'data' => $this->get($id)];
    }

    public function delete(int|string $id, ?array $user): array
    {
        $this->db->run('UPDATE blog_posts SET deleted_at=NOW() WHERE id=? AND deleted_at IS NULL', [(int) $id]);
        return ['ok' => true, 'data' => ['id' => (int) $id, 'mode' => 'trash']];
    }

    public function publish(int|string $id, string $status, ?array $user): array
    {
        if (!in_array($status, ['draft', 'published', 'archived'], true)) {
            return ['ok' => false, 'code' => 'validation', 'error' => 'Invalid status'];
        }
        $this->db->run(
            $status === 'published'
                ? 'UPDATE blog_posts SET status=?, published_at=COALESCE(published_at, NOW()) WHERE id=? AND deleted_at IS NULL'
                : 'UPDATE blog_posts SET status=? WHERE id=? AND deleted_at IS NULL',
            [$status, (int) $id]
        );
        return ['ok' => true, 'data' => ['id' => (int) $id, 'status' => $status]];
    }

    public function relations(int|string $id, string $relation): array
    {
        return $relation === 'tags' ? $this->tags((int) $id) : [];
    }

    public function replaceRelations(int|string $id, string $relation, array $rows, ?array $user): array
    {
        if ($relation !== 'tags') {
            return ['ok' => false, 'code' => 'unknown_relation', 'error' => 'Unknown relation'];
        }
        $this->replaceTags((int) $id, $rows);
        return ['ok' => true, 'data' => $this->tags((int) $id)];
    }

    public function publicList(array $query): array
    {
        return ['items' => array_map(fn(array $row) => $this->enrich($row, false), $this->db->all(
            'SELECT * FROM blog_posts WHERE status=? AND deleted_at IS NULL ORDER BY published_at DESC, id DESC', ['published']
        ))];
    }

    public function publicGet(string $slug): ?array
    {
        $row = $this->db->one('SELECT * FROM blog_posts WHERE slug=? AND status=? AND deleted_at IS NULL', [$slug, 'published']);
        if (!$row) {
            return null;
        }
        $post = $this->enrich($row, true);
        $post['related'] = empty($post['category_id']) ? [] : array_map(
            fn(array $candidate) => $this->enrich($candidate, false),
            $this->db->all(
                'SELECT * FROM blog_posts WHERE status=? AND category_id=? AND id<>? AND deleted_at IS NULL ORDER BY published_at DESC LIMIT 3',
                ['published', $post['category_id'], $post['id']]
            )
        );
        return $post;
    }

    private function writable(array $data): array
    {
        $allowed = ['title', 'slug', 'excerpt', 'content', 'status', 'category_id', 'project_id', 'cover_media_id', 'og_image_id', 'published_at', 'reading_time', 'toc_json', 'seo_title', 'seo_description'];
        $values = [];
        foreach ($allowed as $key) {
            if (!array_key_exists($key, $data)) continue;
            $value = $data[$key];
            $values[$key] = is_array($value) ? json_encode($value, JSON_UNESCAPED_UNICODE) : $value;
        }
        if (isset($values['content'])) {
            $values['content'] = HtmlSanitizer::clean((string) $values['content']);
            $values['reading_time'] = max(1, (int) ceil(str_word_count(strip_tags((string) $values['content'])) / 200));
        }
        if (isset($values['title']) && empty($values['slug'])) $values['slug'] = Str::slug((string) $values['title']);
        if (isset($values['slug'])) $values['slug'] = Str::slug((string) $values['slug']);
        return $values;
    }

    private function enrich(array $post, bool $full = true): array
    {
        $post['toc_json'] = $this->decode($post['toc_json'] ?? null);
        $post['tags'] = $this->tags((int) $post['id']);
        $post['tag_ids'] = array_map(static fn(array $tag) => (int) $tag['id'], $post['tags']);
        $post['category'] = empty($post['category_id']) ? null : $this->db->one('SELECT * FROM blog_categories WHERE id=?', [(int) $post['category_id']]);
        $post['project'] = empty($post['project_id']) ? null : $this->db->one('SELECT id,title,slug FROM projects WHERE id=? AND status=? AND deleted_at IS NULL', [(int) $post['project_id'], 'published']);
        if ($full && empty($post['reading_time']) && !empty($post['content'])) {
            $post['reading_time'] = max(1, (int) ceil(str_word_count(strip_tags((string) $post['content'])) / 200));
        }
        return $post;
    }

    private function tags(int $postId): array
    {
        return $this->db->all('SELECT t.* FROM blog_tags t INNER JOIN blog_post_tags p ON p.tag_id=t.id WHERE p.post_id=? ORDER BY t.name', [$postId]);
    }

    private function replaceTags(int $postId, mixed $tags): void
    {
        if ($tags === null) return;
        $ids = [];
        foreach ((array) $tags as $tag) {
            if (is_numeric($tag)) { $ids[] = (int) $tag; continue; }
            $name = trim((string) (is_array($tag) ? ($tag['name'] ?? '') : $tag));
            if ($name === '') continue;
            $slug = Str::slug($name);
            $row = $this->db->one('SELECT id FROM blog_tags WHERE slug=?', [$slug]);
            if (!$row) {
                $this->db->run('INSERT INTO blog_tags(name,slug) VALUES(?,?)', [$name, $slug]);
                $ids[] = $this->db->lastInsertId();
            } else $ids[] = (int) $row['id'];
        }
        $this->db->run('DELETE FROM blog_post_tags WHERE post_id=?', [$postId]);
        foreach (array_unique($ids) as $id) $this->db->run('INSERT INTO blog_post_tags(post_id,tag_id) VALUES(?,?)', [$postId, $id]);
    }

    private function decode(mixed $value): mixed
    {
        if (!is_string($value) || $value === '') return $value;
        $decoded = json_decode($value, true);
        return json_last_error() === JSON_ERROR_NONE ? $decoded : $value;
    }
}
