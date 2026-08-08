<?php
declare(strict_types=1);

namespace App\PackageModules\Projects;

use App\Platform\Contracts\ContentResourceHandler;
use App\Platform\Contracts\PlatformDatabaseInterface;
use App\Utils\HtmlSanitizer;
use App\Utils\Str;

/** Package-owned project CRUD, public projection and relation persistence. */
final class ProjectResourceHandler implements ContentResourceHandler
{
    public function __construct(private PlatformDatabaseInterface $db) {}

    public function list(array $query): array
    {
        return ['items' => array_map(fn(array $row) => $this->enrich($row), $this->db->all('SELECT * FROM projects WHERE deleted_at IS NULL ORDER BY sort_order, id DESC'))];
    }
    public function get(int|string $idOrSlug, array $opts = []): ?array
    {
        $field = is_numeric($idOrSlug) ? 'id' : 'slug';
        $row = $this->db->one("SELECT * FROM projects WHERE {$field}=? AND deleted_at IS NULL", [$idOrSlug]);
        return $row ? $this->enrich($row, true) : null;
    }
    public function create(array $data, ?array $user): array
    {
        $values = $this->writable($data);
        if ($values === []) return ['ok' => false, 'code' => 'validation', 'error' => 'No writable fields'];
        $id = $this->db->transaction(function () use ($values, $data): int {
            $cols = array_keys($values);
            $this->db->run('INSERT INTO projects (`' . implode('`,`', $cols) . '`) VALUES (' . implode(',', array_fill(0, count($cols), '?')) . ')', array_values($values));
            $id = $this->db->lastInsertId();
            $this->replaceAllRelations($id, $data);
            return $id;
        });
        return ['ok' => true, 'data' => $this->get($id)];
    }
    public function update(int|string $id, array $data, ?array $user): array
    {
        if (!$this->get($id)) return ['ok' => false, 'code' => 'not_found', 'error' => 'Not found'];
        $values = $this->writable($data);
        $this->db->transaction(function () use ($id, $values, $data): void {
            if ($values !== []) $this->db->run('UPDATE projects SET ' . implode(',', array_map(static fn($c) => "`{$c}`=?", array_keys($values))) . ' WHERE id=? AND deleted_at IS NULL', array_merge(array_values($values), [(int) $id]));
            $this->replaceAllRelations((int) $id, $data);
        });
        return ['ok' => true, 'data' => $this->get($id)];
    }
    public function delete(int|string $id, ?array $user): array
    {
        $this->db->run('UPDATE projects SET deleted_at=NOW() WHERE id=? AND deleted_at IS NULL', [(int) $id]);
        return ['ok' => true, 'data' => ['id' => (int) $id, 'mode' => 'trash']];
    }
    public function publish(int|string $id, string $status, ?array $user): array
    {
        if (!in_array($status, ['draft', 'published', 'archived'], true)) return ['ok' => false, 'code' => 'validation', 'error' => 'Invalid status'];
        $this->db->run($status === 'published' ? 'UPDATE projects SET status=?, published_at=COALESCE(published_at,NOW()) WHERE id=? AND deleted_at IS NULL' : 'UPDATE projects SET status=? WHERE id=? AND deleted_at IS NULL', [$status, (int) $id]);
        return ['ok' => true, 'data' => ['id' => (int) $id, 'status' => $status]];
    }
    public function relations(int|string $id, string $relation): array
    {
        return match ($relation) {
            'technologies' => $this->db->all('SELECT * FROM project_technologies WHERE project_id=? ORDER BY sort_order,id', [(int) $id]),
            'features' => $this->db->all('SELECT * FROM project_features WHERE project_id=? ORDER BY sort_order,id', [(int) $id]),
            'timeline' => $this->db->all('SELECT * FROM project_timeline WHERE project_id=? ORDER BY sort_order,id', [(int) $id]),
            'tags' => $this->tags((int) $id),
            'media', 'gallery' => $this->media((int) $id),
            default => [],
        };
    }
    public function replaceRelations(int|string $id, string $relation, array $rows, ?array $user): array
    {
        if (!in_array($relation, ['technologies', 'features', 'timeline', 'tags', 'media', 'gallery'], true)) return ['ok' => false, 'code' => 'unknown_relation', 'error' => 'Unknown relation'];
        $this->replaceAllRelations((int) $id, [$relation => $rows]);
        return ['ok' => true, 'data' => $this->relations($id, $relation)];
    }
    public function publicList(array $query): array
    {
        $sql = 'SELECT * FROM projects WHERE status=? AND deleted_at IS NULL';
        $params = ['published'];
        if (($query['featured'] ?? null) === '1' || ($query['featured'] ?? null) === true) $sql .= ' AND is_featured=1';
        $sql .= ' ORDER BY sort_order,published_at DESC,id DESC';
        return ['items' => array_map(fn(array $row) => $this->enrich($row, false), $this->db->all($sql, $params))];
    }
    public function publicGet(string $slug): ?array
    {
        $row = $this->db->one('SELECT * FROM projects WHERE slug=? AND status=? AND deleted_at IS NULL', [$slug, 'published']);
        return $row ? $this->enrich($row, true) : null;
    }
    private function writable(array $data): array
    {
        $allowed = ['title','slug','short_description','description','content','status','project_status','is_featured','featured_priority','category_id','cover_media_id','cover_portrait_media_id','cover_landscape_media_id','og_image_id','sort_order','role','github_url','website_url','video_url','published_at','seo_title','seo_description'];
        $out = [];
        foreach ($allowed as $key) if (array_key_exists($key, $data)) $out[$key] = is_array($data[$key]) ? json_encode($data[$key], JSON_UNESCAPED_UNICODE) : $data[$key];
        foreach (['description','content','short_description'] as $key) if (isset($out[$key]) && is_string($out[$key])) $out[$key] = HtmlSanitizer::clean($out[$key]);
        if (isset($out['title']) && empty($out['slug'])) $out['slug'] = Str::slug((string) $out['title']);
        if (isset($out['slug'])) $out['slug'] = Str::slug((string) $out['slug']);
        return $out;
    }
    private function enrich(array $project, bool $full = true): array
    {
        $id = (int) $project['id'];
        $project['technologies'] = $this->relations($id, 'technologies');
        $project['tags'] = $this->tags($id);
        $project['tag_ids'] = array_map(static fn(array $tag) => (int) $tag['id'], $project['tags']);
        if ($full) {
            $project['media'] = $this->media($id);
            $project['features'] = $this->relations($id, 'features');
            $project['timeline'] = $this->relations($id, 'timeline');
            $project['category'] = empty($project['category_id']) ? null : $this->db->one('SELECT * FROM project_categories WHERE id=?', [(int) $project['category_id']]);
            $project['related_posts'] = $this->db->all('SELECT id,title,slug,excerpt,cover_media_id,published_at,reading_time FROM blog_posts WHERE status=? AND project_id=? AND deleted_at IS NULL ORDER BY published_at DESC,id DESC LIMIT 6', ['published', $id]);
        }
        return $project;
    }
    private function tags(int $id): array
    {
        return $this->db->all('SELECT t.* FROM project_tags t INNER JOIN project_tag_pivot p ON p.tag_id=t.id WHERE p.project_id=? ORDER BY t.name', [$id]);
    }
    private function media(int $id): array
    {
        return $this->db->all("SELECT pm.id AS project_media_id,pm.project_id,pm.media_id,pm.caption,pm.url,pm.media_type,pm.sort_order,m.id,m.path,m.thumbnail_path,m.webp_path,m.alt_text,m.original_name,m.mime_type FROM project_media pm LEFT JOIN media m ON m.id=pm.media_id AND m.deleted_at IS NULL WHERE pm.project_id=? AND (pm.media_id IS NULL OR m.id IS NOT NULL OR (pm.url IS NOT NULL AND pm.url != '')) ORDER BY pm.sort_order,pm.id", [$id]);
    }
    private function replaceAllRelations(int $id, array $data): void
    {
        foreach (['technologies' => ['project_technologies', ['name','icon']], 'features' => ['project_features', ['title','description','icon']], 'timeline' => ['project_timeline', ['title','description','event_date']]] as $key => [$table, $columns]) {
            if (!array_key_exists($key, $data)) continue;
            $this->db->run("DELETE FROM {$table} WHERE project_id=?", [$id]);
            foreach ((array) $data[$key] as $i => $row) {
                $row = is_array($row) ? $row : [$columns[0] => $row];
                $vals = array_map(static fn($column) => $row[$column] ?? null, $columns);
                $this->db->run("INSERT INTO {$table}(project_id," . implode(',', $columns) . ',sort_order) VALUES(' . implode(',', array_fill(0, count($columns) + 2, '?')) . ')', array_merge([$id], $vals, [(int) ($row['sort_order'] ?? $i)]));
            }
        }
        if (array_key_exists('tags', $data) || array_key_exists('tag_ids', $data)) {
            $this->db->run('DELETE FROM project_tag_pivot WHERE project_id=?', [$id]);
            foreach ((array) ($data['tag_ids'] ?? $data['tags']) as $tag) {
                if (!is_numeric($tag)) { $name = trim((string) (is_array($tag) ? ($tag['name'] ?? '') : $tag)); if ($name === '') continue; $found = $this->db->one('SELECT id FROM project_tags WHERE slug=?', [Str::slug($name)]); if (!$found) { $this->db->run('INSERT INTO project_tags(name,slug) VALUES(?,?)', [$name, Str::slug($name)]); $tag = $this->db->lastInsertId(); } else $tag = $found['id']; }
                $this->db->run('INSERT INTO project_tag_pivot(project_id,tag_id) VALUES(?,?)', [$id, (int) $tag]);
            }
        }
        $media = $data['media'] ?? $data['gallery'] ?? null;
        if ($media !== null) {
            $this->db->run('DELETE FROM project_media WHERE project_id=?', [$id]);
            foreach ((array) $media as $i => $row) { $row = is_array($row) ? $row : ['media_id' => $row]; $this->db->run('INSERT INTO project_media(project_id,media_id,caption,url,media_type,sort_order) VALUES(?,?,?,?,?,?)', [$id, !empty($row['media_id']) ? (int) $row['media_id'] : null, $row['caption'] ?? null, $row['url'] ?? null, in_array($row['media_type'] ?? 'gallery', ['image','screenshot','video','gallery'], true) ? ($row['media_type'] ?? 'gallery') : 'gallery', (int) ($row['sort_order'] ?? $i)]); }
        }
    }
}
