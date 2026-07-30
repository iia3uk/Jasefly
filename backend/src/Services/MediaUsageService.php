<?php
declare(strict_types=1);

namespace App\Services;

use App\Database;

/**
 * Tracks which media IDs appear in content, and which are safe to stream
 * without authentication (published / public site surfaces only).
 *
 * Collectors are additive: column FKs, JSON layouts/galleries, then HTML/text
 * bodies (blog, pages, comments). New sources can be registered in
 * {@see collectFromHtmlBodies} without changing unused() callers.
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
        foreach ($this->referenceQueries(false) as $sql) {
            $this->collectIds($ids, $sql);
        }
        $this->collectFromJsonColumns($ids, false);
        $this->collectFromHtmlBodies($ids, false);
        return array_keys($ids);
    }

    /** @return int[] media IDs visible on the public site */
    public function publiclyAccessibleIds(): array
    {
        $ids = [];
        foreach ($this->referenceQueries(true) as $sql) {
            $this->collectIds($ids, $sql);
        }
        $this->collectFromJsonColumns($ids, true);
        $this->collectFromHtmlBodies($ids, true);
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
    private function collectIds(array &$ids, string $sql): void
    {
        try {
            foreach ($this->db->all($sql) as $row) {
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
    private function referenceQueries(bool $publicOnly): array
    {
        $queries = [
            // Always public site chrome
            'SELECT photo_media_id id FROM profile WHERE photo_media_id IS NOT NULL',
            'SELECT avatar_media_id id FROM profile WHERE avatar_media_id IS NOT NULL',
            'SELECT resume_media_id id FROM profile WHERE resume_media_id IS NOT NULL',
            'SELECT background_media_id id FROM hero_settings WHERE background_media_id IS NOT NULL',
            'SELECT favicon_media_id id FROM seo_settings WHERE favicon_media_id IS NOT NULL',
            'SELECT og_image_id id FROM seo_settings WHERE og_image_id IS NOT NULL',
            'SELECT logo_media_id id FROM site_settings WHERE logo_media_id IS NOT NULL',
        ];

        if ($publicOnly) {
            $queries[] = "SELECT cover_media_id id FROM projects WHERE cover_media_id IS NOT NULL AND status='published' AND deleted_at IS NULL";
            $queries[] = "SELECT og_image_id id FROM projects WHERE og_image_id IS NOT NULL AND status='published' AND deleted_at IS NULL";
            $queries[] = "SELECT pm.media_id id FROM project_media pm INNER JOIN projects p ON p.id=pm.project_id WHERE p.status='published' AND p.deleted_at IS NULL";
            $queries[] = "SELECT cover_media_id id FROM blog_posts WHERE cover_media_id IS NOT NULL AND status='published' AND deleted_at IS NULL";
            $queries[] = "SELECT og_image_id id FROM blog_posts WHERE og_image_id IS NOT NULL AND status='published' AND deleted_at IS NULL";
            $queries[] = "SELECT media_id id FROM homepage_sections WHERE media_id IS NOT NULL AND is_visible=1";
            $queries[] = "SELECT avatar_media_id id FROM testimonials WHERE avatar_media_id IS NOT NULL AND is_visible=1 AND deleted_at IS NULL";
            $queries[] = "SELECT media_id id FROM services WHERE media_id IS NOT NULL AND is_visible=1 AND deleted_at IS NULL";
            $queries[] = "SELECT media_id id FROM products WHERE media_id IS NOT NULL AND is_visible=1 AND deleted_at IS NULL";
        } else {
            $queries[] = 'SELECT cover_media_id id FROM projects WHERE cover_media_id IS NOT NULL';
            $queries[] = 'SELECT og_image_id id FROM projects WHERE og_image_id IS NOT NULL';
            $queries[] = 'SELECT media_id id FROM project_media';
            $queries[] = 'SELECT cover_media_id id FROM blog_posts WHERE cover_media_id IS NOT NULL';
            $queries[] = 'SELECT og_image_id id FROM blog_posts WHERE og_image_id IS NOT NULL';
            $queries[] = 'SELECT media_id id FROM homepage_sections WHERE media_id IS NOT NULL';
            $queries[] = 'SELECT avatar_media_id id FROM testimonials WHERE avatar_media_id IS NOT NULL';
            $queries[] = 'SELECT media_id id FROM services WHERE media_id IS NOT NULL';
            $queries[] = 'SELECT media_id id FROM products WHERE media_id IS NOT NULL';
        }

        return $queries;
    }

    /**
     * Pull media ids from JSON blobs (product galleries, page layouts).
     *
     * @param array<int, true> $ids
     */
    private function collectFromJsonColumns(array &$ids, bool $publicOnly): void
    {
        try {
            $productSql = $publicOnly
                ? "SELECT gallery FROM products WHERE gallery IS NOT NULL AND gallery!='' AND deleted_at IS NULL"
                : "SELECT gallery FROM products WHERE gallery IS NOT NULL AND gallery!=''";
            foreach ($this->db->all($productSql) as $row) {
                $this->extractIdsFromMixed($ids, $row['gallery'] ?? null);
            }
        } catch (\Throwable) {
        }

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
     * Scan HTML/text bodies for /media/{id} and media_id references
     * (blog posts, page content, comments, product descriptions).
     *
     * @param array<int, true> $ids
     */
    private function collectFromHtmlBodies(array &$ids, bool $publicOnly): void
    {
        /** @var list<array{0: string, 1: string}> $sources sql => column */
        $sources = [];

        $sources[] = [
            $publicOnly
                ? "SELECT content FROM blog_posts WHERE content IS NOT NULL AND content!='' AND status='published' AND deleted_at IS NULL"
                : "SELECT content FROM blog_posts WHERE content IS NOT NULL AND content!=''",
            'content',
        ];
        $sources[] = [
            $publicOnly
                ? "SELECT content FROM pages WHERE content IS NOT NULL AND content!='' AND status='published'"
                : "SELECT content FROM pages WHERE content IS NOT NULL AND content!=''",
            'content',
        ];
        $sources[] = [
            $publicOnly
                ? "SELECT body FROM comments WHERE body IS NOT NULL AND body!='' AND status='approved' AND deleted_at IS NULL"
                : "SELECT body FROM comments WHERE body IS NOT NULL AND body!='' AND deleted_at IS NULL",
            'body',
        ];
        $sources[] = [
            $publicOnly
                ? "SELECT description FROM products WHERE description IS NOT NULL AND description!='' AND is_visible=1 AND deleted_at IS NULL"
                : "SELECT description FROM products WHERE description IS NOT NULL AND description!=''",
            'description',
        ];

        foreach ($sources as [$sql, $column]) {
            try {
                foreach ($this->db->all($sql) as $row) {
                    $this->extractIdsFromHtml($ids, (string) ($row[$column] ?? ''));
                }
            } catch (\Throwable) {
                // Table/column may be absent on partial installs.
            }
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
        if (preg_match_all('#/(?:api/v1/)?media/(\d{1,10})\b#i', $html, $m)) {
            foreach ($m[1] as $n) {
                $ids[(int) $n] = true;
            }
        }
        if (preg_match_all('#\bmedia_id["\']?\s*[:=]\s*["\']?(\d{1,10})\b#i', $html, $m2)) {
            foreach ($m2[1] as $n) {
                $ids[(int) $n] = true;
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
            if (!is_array($decoded)) {
                // Plain list: "12,15" or single number
                if (preg_match_all('/\b(\d{1,10})\b/', $raw, $m)) {
                    foreach ($m[1] as $n) {
                        $ids[(int) $n] = true;
                    }
                }
                return;
            }
            $raw = $decoded;
        }
        if (!is_array($raw)) {
            return;
        }
        $this->walkForMediaIds($ids, $raw);
    }

    /**
     * @param array<int, true> $ids
     * @param array<mixed> $node
     */
    private function walkForMediaIds(array &$ids, array $node): void
    {
        foreach ($node as $key => $value) {
            if (is_array($value)) {
                if (
                    is_string($key)
                    && ($key === 'gallery' || $key === 'media_ids')
                    && array_is_list($value)
                ) {
                    foreach ($value as $item) {
                        if (is_numeric($item) && (int) $item > 0) {
                            $ids[(int) $item] = true;
                        } elseif (is_array($item)) {
                            $this->walkForMediaIds($ids, $item);
                        }
                    }
                    continue;
                }
                $this->walkForMediaIds($ids, $value);
                continue;
            }
            if (!is_numeric($value) || (int) $value <= 0) {
                continue;
            }
            if (
                is_string($key)
                && (
                    $key === 'media_id'
                    || $key === 'og_image_id'
                    || str_ends_with($key, '_media_id')
                )
            ) {
                $ids[(int) $value] = true;
            }
        }
    }

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
