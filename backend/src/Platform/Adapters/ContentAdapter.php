<?php
declare(strict_types=1);

namespace App\Platform\Adapters;

use App\Database;
use App\Platform\Contracts\PlatformContentInterface;

final class ContentAdapter implements PlatformContentInterface
{
    public function __construct(private Database $db) {}

    public function pageBySlug(string $slug): ?array
    {
        try {
            return $this->db->one(
                "SELECT * FROM pages WHERE slug=? AND status='published' LIMIT 1",
                [$slug]
            );
        } catch (\Throwable) {
            return null;
        }
    }

    public function publishedPages(int $limit = 50): array
    {
        $limit = max(1, min(200, $limit));
        try {
            return $this->db->all(
                "SELECT id, slug, title, status FROM pages WHERE status='published' ORDER BY id DESC LIMIT {$limit}"
            );
        } catch (\Throwable) {
            return [];
        }
    }

    public function isContentResource(string $resource): bool
    {
        $resource = strtolower(trim($resource));
        $aliases = ['blog' => 'blog_posts', 'navigation' => 'navigation_items'];
        $resource = $aliases[$resource] ?? $resource;
        return in_array($resource, [
            'pages', 'blog_posts', 'projects', 'services', 'testimonials',
            'navigation_items', 'products', 'hero_settings', 'footer_settings',
            'contact_info', 'site_settings', 'seo_settings',
        ], true);
    }
    /**
     * @return list<string> unique trimmed strings (2вЂ“2000 chars)
     */
    public function collectHumanReadableStrings(int $max = 2500): array
    {
        $bag = [];

        // Skip slug вЂ” URL tokens, not overlay copy (aligned with TranslateSync).
        $this->addScalarRows($bag, 'pages', ['title', 'seo_title', 'seo_description', 'content'], $max);
        $this->addJsonColumn($bag, 'pages', 'layout_json', $max);

        $this->addScalarRows($bag, 'blog_posts', ['title', 'excerpt', 'seo_title', 'seo_description', 'content'], $max);
        $this->addScalarRows($bag, 'projects', ['title', 'short_description', 'description', 'content', 'seo_title', 'seo_description', 'role'], $max);
        $this->addScalarRows($bag, 'services', ['title', 'short_description', 'description', 'content', 'price_label'], $max);
        $this->addScalarRows($bag, 'testimonials', ['author_name', 'author_role', 'author_company', 'content'], $max);
        $this->addScalarRows($bag, 'navigation_items', ['label'], $max);
        $this->addScalarRows($bag, 'products', ['title', 'short_description', 'description'], $max);

        foreach (['hero_settings', 'footer_settings', 'contact_info', 'site_settings', 'seo_settings'] as $table) {
            $this->addSingletonRow($bag, $table, $max);
        }

        $list = array_keys($bag);
        usort($list, static fn ($a, $b) => strlen($a) <=> strlen($b));
        return array_slice($list, 0, $max);
    }

    /** @param array<string, true> $bag */
    private function addScalarRows(array &$bag, string $table, array $cols, int $max): void
    {
        if (count($bag) >= $max || !$this->humanReadableTableExists($table)) {
            return;
        }
        $safe = [];
        foreach ($cols as $c) {
            if ($this->humanReadableColumnExists($table, $c)) {
                $safe[] = "`$c`";
            }
        }
        if ($safe === []) {
            return;
        }
        $deleted = $this->humanReadableColumnExists($table, 'deleted_at') ? ' WHERE deleted_at IS NULL' : '';
        try {
            $rows = $this->db->all('SELECT ' . implode(',', $safe) . " FROM `$table`" . $deleted . ' LIMIT 800');
        } catch (\Throwable) {
            return;
        }
        foreach ($rows as $row) {
            foreach ($row as $val) {
                $this->ingest($bag, $val, $max);
                if (count($bag) >= $max) {
                    return;
                }
            }
        }
    }

    /** @param array<string, true> $bag */
    private function addJsonColumn(array &$bag, string $table, string $col, int $max): void
    {
        if (count($bag) >= $max || !$this->humanReadableTableExists($table) || !$this->humanReadableColumnExists($table, $col)) {
            return;
        }
        $deleted = $this->humanReadableColumnExists($table, 'deleted_at') ? ' WHERE deleted_at IS NULL' : '';
        try {
            $rows = $this->db->all("SELECT `$col` AS j FROM `$table`" . $deleted . ' LIMIT 200');
        } catch (\Throwable) {
            return;
        }
        foreach ($rows as $row) {
            $raw = $row['j'] ?? null;
            if (!is_string($raw) || $raw === '') {
                continue;
            }
            $decoded = json_decode($raw, true);
            if (is_array($decoded)) {
                $this->walkJson($bag, $decoded, $max);
            }
            if (count($bag) >= $max) {
                return;
            }
        }
    }

    /** @param array<string, true> $bag */
    private function addSingletonRow(array &$bag, string $table, int $max): void
    {
        if (count($bag) >= $max || !$this->humanReadableTableExists($table)) {
            return;
        }
        try {
            $row = $this->db->one("SELECT * FROM `$table` LIMIT 1");
        } catch (\Throwable) {
            return;
        }
        if (!$row) {
            return;
        }
        foreach ($row as $key => $val) {
            if (in_array($key, ['id', 'created_at', 'updated_at', 'logo_media_id', 'og_image_id', 'background_media_id', 'slug'], true)) {
                continue;
            }
            if (str_ends_with((string) $key, '_id') || str_ends_with((string) $key, '_at')) {
                continue;
            }
            // Opaque JSON blobs в†’ walk leaves (columns_json, theme maps, etc.).
            if (is_string($val)) {
                $trim = ltrim($val);
                if ($trim !== '' && ($trim[0] === '{' || $trim[0] === '[')) {
                    $decoded = json_decode($val, true);
                    if (is_array($decoded)) {
                        $this->walkJson($bag, $decoded, $max);
                        if (count($bag) >= $max) {
                            return;
                        }
                        continue;
                    }
                }
            }
            $this->ingest($bag, $val, $max);
            if (count($bag) >= $max) {
                return;
            }
        }
    }

    /**
     * @param array<string, true> $bag
     * @param mixed $node
     */
    private function walkJson(array &$bag, mixed $node, int $max): void
    {
        if (count($bag) >= $max) {
            return;
        }
        if (is_string($node)) {
            $this->ingest($bag, $node, $max);
            return;
        }
        if (!is_array($node)) {
            return;
        }
        foreach ($node as $k => $v) {
            // Skip technical keys
            if (is_string($k) && preg_match('/^(id|elType|widgetType|width|gap|padding|margin|color|href|url|src|className|type)$/i', $k)) {
                if (is_string($v) && in_array($k, ['href', 'url', 'src', 'id', 'elType', 'widgetType', 'className', 'type'], true)) {
                    continue;
                }
            }
            $this->walkJson($bag, $v, $max);
            if (count($bag) >= $max) {
                return;
            }
        }
    }

    /** @param array<string, true> $bag */
    private function ingest(array &$bag, mixed $val, int $max): void
    {
        if (!is_string($val) && !is_numeric($val)) {
            return;
        }
        $raw = (string) $val;
        // Break block/list HTML into lines BEFORE strip_tags, otherwise
        // "<li>a</li><li>b</li>" becomes one corpus string "a b" / "ab"
        // while the DOM has separate text nodes that miss the cache.
        if (str_contains($raw, '<')) {
            $raw = preg_replace('/<br\s*\/?>/iu', "\n", $raw) ?? $raw;
            $raw = preg_replace('/<\/(p|li|div|h[1-6]|tr|td|th|blockquote|section|article|figcaption)>/iu', "\n", $raw) ?? $raw;
            $raw = preg_replace('/<(p|li|div|h[1-6]|tr|td|th|blockquote|section|article)\b[^>]*>/iu', "\n", $raw) ?? $raw;
        }
        $text = html_entity_decode(strip_tags($raw), ENT_QUOTES | ENT_HTML5, 'UTF-8');
        // Split HTML leftovers / multiline into phrases
        $parts = preg_split('/[\r\n]+/u', $text) ?: [$text];
        foreach ($parts as $part) {
            $t = trim(preg_replace('/\s+/u', ' ', $part) ?? '');
            if ($t === '' || mb_strlen($t) < 2 || mb_strlen($t) > 2000) {
                continue;
            }
            // Skip URLs and strings without letters (codes / punctuation only)
            if (preg_match('#^(https?://|mailto:|/)#i', $t)) {
                continue;
            }
            if (!preg_match('/\p{L}/u', $t)) {
                continue;
            }
            $bag[$t] = true;
            if (count($bag) >= $max) {
                return;
            }
        }
    }

    private function humanReadableTableExists(string $table): bool
    {
        try {
            $this->db->one("SELECT 1 FROM `$table` LIMIT 1");
            return true;
        } catch (\Throwable) {
            return false;
        }
    }

    private function humanReadableColumnExists(string $table, string $col): bool
    {
        try {
            $this->db->one("SELECT `$col` FROM `$table` LIMIT 1");
            return true;
        } catch (\Throwable) {
            return false;
        }
    }

}
