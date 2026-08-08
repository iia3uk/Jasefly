<?php
declare(strict_types=1);

namespace App\Services;

use App\Database;
use App\Platform\Surfaces\PackageSurfaceRegistry;
use App\Platform\Surfaces\SurfaceSql;

/**
 * Tracks which media IDs appear in content, and which are safe to stream
 * without authentication (published / public site surfaces only).
 *
 * Host collectors cover core tables; package media refs come from
 * {@see PackageSurfaceRegistry::mediaCollectors()}.
 */
final class MediaUsageService
{
    private const STAFF_ROLES = ['super_admin', 'admin', 'editor'];

    public function __construct(private Database $db) {}

    public static function isStaffRole(?string $role): bool
    {
        return $role !== null && $role !== '' && in_array($role, self::STAFF_ROLES, true);
    }

    /** @return int[] media IDs referenced anywhere (incl. drafts) */
    public function referencedIds(): array
    {
        $ids = [];
        foreach ($this->hostReferenceQueries(false) as $sql) {
            $this->collectIds($ids, $sql);
        }
        $this->collectFromPackageSurfaces($ids, false);
        $this->collectFromHostJsonColumns($ids, false);
        $this->collectFromHostHtmlBodies($ids, false);
        return array_keys($ids);
    }

    /** @return int[] media IDs visible on the public site */
    public function publiclyAccessibleIds(): array
    {
        $ids = [];
        foreach ($this->hostReferenceQueries(true) as $sql) {
            $this->collectIds($ids, $sql);
        }
        $this->collectFromPackageSurfaces($ids, true);
        $this->collectFromHostJsonColumns($ids, true);
        $this->collectFromHostHtmlBodies($ids, true);
        return array_keys($ids);
    }

    public function isPubliclyAccessible(int $id): bool
    {
        if ($id <= 0) {
            return false;
        }
        static $cache = null;
        if ($cache === null) {
            $cache = array_fill_keys($this->publiclyAccessibleIds(), true);
        }
        return isset($cache[$id]);
    }

    /**
     * @param array<int, true> $ids
     */
    private function collectIds(array &$ids, string $sql, array $params = []): void
    {
        try {
            foreach ($this->db->all($sql, $params) as $row) {
                if (!empty($row['id'])) {
                    $ids[(int) $row['id']] = true;
                }
            }
        } catch (\Throwable) {
            // Table may be absent on partial installs.
        }
    }

    /**
     * @return list<string>
     */
    private function hostReferenceQueries(bool $publicOnly): array
    {
        $queries = [
            'SELECT photo_media_id id FROM profile WHERE photo_media_id IS NOT NULL',
            'SELECT avatar_media_id id FROM profile WHERE avatar_media_id IS NOT NULL',
            'SELECT resume_media_id id FROM profile WHERE resume_media_id IS NOT NULL',
            'SELECT background_media_id id FROM hero_settings WHERE background_media_id IS NOT NULL',
            'SELECT favicon_media_id id FROM seo_settings WHERE favicon_media_id IS NOT NULL',
            'SELECT og_image_id id FROM seo_settings WHERE og_image_id IS NOT NULL',
            'SELECT logo_media_id id FROM site_settings WHERE logo_media_id IS NOT NULL',
        ];

        if ($publicOnly) {
            $queries[] = 'SELECT media_id id FROM homepage_sections WHERE media_id IS NOT NULL AND is_visible=1';
            $queries[] = 'SELECT avatar_media_id id FROM testimonials WHERE avatar_media_id IS NOT NULL AND is_visible=1 AND deleted_at IS NULL';
            $queries[] = 'SELECT media_id id FROM services WHERE media_id IS NOT NULL AND is_visible=1 AND deleted_at IS NULL';
        } else {
            $queries[] = 'SELECT media_id id FROM homepage_sections WHERE media_id IS NOT NULL';
            $queries[] = 'SELECT avatar_media_id id FROM testimonials WHERE avatar_media_id IS NOT NULL';
            $queries[] = 'SELECT media_id id FROM services WHERE media_id IS NOT NULL';
        }

        return $queries;
    }

    /**
     * @param array<int, true> $ids
     */
    private function collectFromPackageSurfaces(array &$ids, bool $publicOnly): void
    {
        foreach (PackageSurfaceRegistry::mediaCollectors() as $def) {
            $table = SurfaceSql::ident((string) ($def['table'] ?? ''));
            if ($table === null) {
                continue;
            }

            $join = is_array($def['join'] ?? null) ? $def['join'] : null;
            if ($join === null && !empty($def['parent_table']) && !empty($def['join_on'])) {
                $join = [
                    'from' => $table,
                    'column' => is_array($def['columns'] ?? null) && isset($def['columns'][0])
                        ? (string) $def['columns'][0]
                        : 'media_id',
                    'parent_table' => (string) $def['parent_table'],
                    'parent_key' => (string) $def['join_on'],
                    'parent_pk' => 'id',
                    'public_where' => $def['public_where'] ?? null,
                    'soft_delete' => $def['soft_delete'] ?? true,
                ];
            }
            if ($join !== null) {
                $this->collectJoinedMedia($ids, $def, $join, $publicOnly);
                continue;
            }

            $columns = $def['columns'] ?? [];
            if (!is_array($columns)) {
                $columns = [];
            }
            $where = [];
            $params = [];
            if ($publicOnly && is_array($def['public_where'] ?? null)) {
                [$wSql, $wParams] = SurfaceSql::equalityWhere($def['public_where']);
                $where[] = $wSql;
                $params = array_merge($params, $wParams);
            }
            if (!empty($def['soft_delete'])) {
                $where[] = 'deleted_at IS NULL';
            }
            $whereSql = $where === [] ? '1=1' : implode(' AND ', $where);

            foreach ($columns as $colRaw) {
                $col = SurfaceSql::ident((string) $colRaw);
                if ($col === null) {
                    continue;
                }
                $this->collectIds(
                    $ids,
                    "SELECT `{$col}` id FROM `{$table}` WHERE `{$col}` IS NOT NULL AND {$whereSql}",
                    $params
                );
            }

            $jsonCols = $def['json_columns'] ?? [];
            if (is_array($jsonCols)) {
                foreach ($jsonCols as $colRaw) {
                    $col = SurfaceSql::ident((string) $colRaw);
                    if ($col === null) {
                        continue;
                    }
                    try {
                        foreach ($this->db->all(
                            "SELECT `{$col}` AS blob FROM `{$table}` WHERE `{$col}` IS NOT NULL AND `{$col}`!='' AND {$whereSql}",
                            $params
                        ) as $row) {
                            $this->extractIdsFromMixed($ids, $row['blob'] ?? null);
                        }
                    } catch (\Throwable) {
                    }
                }
            }

            $htmlCols = $def['html_columns'] ?? [];
            if (is_array($htmlCols)) {
                foreach ($htmlCols as $colRaw) {
                    $col = SurfaceSql::ident((string) $colRaw);
                    if ($col === null) {
                        continue;
                    }
                    try {
                        foreach ($this->db->all(
                            "SELECT `{$col}` AS body FROM `{$table}` WHERE `{$col}` IS NOT NULL AND `{$col}`!='' AND {$whereSql}",
                            $params
                        ) as $row) {
                            $this->extractIdsFromHtml($ids, (string) ($row['body'] ?? ''));
                        }
                    } catch (\Throwable) {
                    }
                }
            }
        }
    }

    /**
     * @param array<int, true> $ids
     * @param array<string, mixed> $def
     * @param array<string, mixed> $join
     */
    private function collectJoinedMedia(array &$ids, array $def, array $join, bool $publicOnly): void
    {
        $from = SurfaceSql::ident((string) ($join['from'] ?? ''));
        $col = SurfaceSql::ident((string) ($join['column'] ?? 'media_id'));
        $parent = SurfaceSql::ident((string) ($join['parent_table'] ?? $def['table'] ?? ''));
        $fk = SurfaceSql::ident((string) ($join['parent_key'] ?? ''));
        $pk = SurfaceSql::ident((string) ($join['parent_pk'] ?? 'id'));
        if ($from === null || $col === null || $parent === null || $fk === null || $pk === null) {
            return;
        }
        if ($publicOnly) {
            $pWhere = is_array($join['public_where'] ?? null) ? $join['public_where'] : (is_array($def['public_where'] ?? null) ? $def['public_where'] : []);
            [$wSql, $params] = SurfaceSql::equalityWhere($pWhere);
            $wSql = preg_replace('/`([a-z][a-z0-9_]{0,63})`/', 'p.`$1`', $wSql) ?? $wSql;
            $soft = !empty($def['soft_delete']) || !empty($join['soft_delete']) ? ' AND p.deleted_at IS NULL' : '';
            $this->collectIds(
                $ids,
                "SELECT j.`{$col}` id FROM `{$from}` j INNER JOIN `{$parent}` p ON p.`{$pk}`=j.`{$fk}` WHERE j.`{$col}` IS NOT NULL AND {$wSql}{$soft}",
                $params
            );
            return;
        }
        $this->collectIds($ids, "SELECT `{$col}` id FROM `{$from}` WHERE `{$col}` IS NOT NULL");
    }

    /**
     * @param array<int, true> $ids
     */
    private function collectFromHostJsonColumns(array &$ids, bool $publicOnly): void
    {
        try {
            $pageSql = $publicOnly
                ? "SELECT layout_json FROM pages WHERE status='published' AND layout_json IS NOT NULL AND layout_json!=''"
                : "SELECT layout_json FROM pages WHERE layout_json IS NOT NULL AND layout_json!=''";
            foreach ($this->db->all($pageSql) as $row) {
                $this->extractIdsFromMixed($ids, $row['layout_json'] ?? null);
            }
        } catch (\Throwable) {
        }
    }

    /**
     * @param array<int, true> $ids
     */
    private function collectFromHostHtmlBodies(array &$ids, bool $publicOnly): void
    {
        // Package HTML bodies (blog/products/comments) register via surfaces.media.html_columns.
        $sources = [
            [
                $publicOnly
                    ? "SELECT content FROM pages WHERE content IS NOT NULL AND content!='' AND status='published'"
                    : "SELECT content FROM pages WHERE content IS NOT NULL AND content!=''",
                'content',
            ],
        ];

        foreach ($sources as [$sql, $column]) {
            try {
                foreach ($this->db->all($sql) as $row) {
                    $this->extractIdsFromHtml($ids, (string) ($row[$column] ?? ''));
                }
            } catch (\Throwable) {
            }
        }
    }

    /**
     * @param array<int, true> $ids
     */
    private function extractIdsFromMixed(array &$ids, mixed $raw): void
    {
        if ($raw === null || $raw === '') {
            return;
        }
        if (is_string($raw)) {
            $decoded = json_decode($raw, true);
            if (json_last_error() === JSON_ERROR_NONE) {
                $this->extractIdsFromMixed($ids, $decoded);
            } else {
                $this->extractIdsFromHtml($ids, $raw);
            }
            return;
        }
        if (is_int($raw) || (is_string($raw) && ctype_digit($raw))) {
            $n = (int) $raw;
            if ($n > 0) {
                $ids[$n] = true;
            }
            return;
        }
        if (!is_array($raw)) {
            return;
        }
        foreach ($raw as $k => $v) {
            if (is_string($k) && (str_ends_with($k, '_media_id') || $k === 'media_id' || $k === 'og_image_id') && (is_int($v) || (is_string($v) && ctype_digit($v)))) {
                $n = (int) $v;
                if ($n > 0) {
                    $ids[$n] = true;
                }
            }
            $this->extractIdsFromMixed($ids, $v);
        }
    }

    /**
     * @param array<int, true> $ids
     */
    private function extractIdsFromHtml(array &$ids, string $html): void
    {
        if ($html === '') {
            return;
        }
        if (preg_match_all('#/media/(\d+)#', $html, $m)) {
            foreach ($m[1] as $id) {
                $ids[(int) $id] = true;
            }
        }
        if (preg_match_all('#["\']media_id["\']\s*:\s*(\d+)#', $html, $m2)) {
            foreach ($m2[1] as $id) {
                $ids[(int) $id] = true;
            }
        }
    }

    /** @return list<array<string, mixed>> */
    public function unused(): array
    {
        $used = $this->referencedIds();
        if (!$used) {
            return $this->db->all('SELECT * FROM media WHERE deleted_at IS NULL ORDER BY id DESC');
        }
        $placeholders = implode(',', array_fill(0, count($used), '?'));
        return $this->db->all(
            "SELECT * FROM media WHERE deleted_at IS NULL AND id NOT IN ($placeholders) ORDER BY id DESC",
            $used
        );
    }
}
