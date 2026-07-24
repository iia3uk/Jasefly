<?php
declare(strict_types=1);

namespace App\Modules\Translate;

use App\Database;

/**
 * Collect unique human-readable strings from CMS content for warmup.
 */
final class TranslateCorpus
{
    public function __construct(private Database $db) {}

    /**
     * @return list<string> unique trimmed strings (2–2000 chars)
     */
    public function collect(int $max = 2500): array
    {
        $bag = [];

        $this->addScalarRows($bag, 'pages', ['title', 'slug', 'seo_title', 'seo_description', 'content'], $max);
        $this->addJsonColumn($bag, 'pages', 'layout_json', $max);

        $this->addScalarRows($bag, 'blog_posts', ['title', 'slug', 'excerpt', 'seo_title', 'seo_description', 'content'], $max);
        $this->addScalarRows($bag, 'projects', ['title', 'slug', 'short_description', 'description', 'content', 'seo_title', 'seo_description', 'role'], $max);
        $this->addScalarRows($bag, 'services', ['title', 'slug', 'short_description', 'description', 'content', 'price_label'], $max);
        $this->addScalarRows($bag, 'testimonials', ['author_name', 'author_role', 'author_company', 'content'], $max);
        $this->addScalarRows($bag, 'navigation_items', ['label'], $max);
        $this->addScalarRows($bag, 'products', ['title', 'slug', 'short_description', 'description'], $max);

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
        if (count($bag) >= $max || !$this->tableExists($table)) {
            return;
        }
        $safe = [];
        foreach ($cols as $c) {
            if ($this->columnExists($table, $c)) {
                $safe[] = "`$c`";
            }
        }
        if ($safe === []) {
            return;
        }
        $deleted = $this->columnExists($table, 'deleted_at') ? ' WHERE deleted_at IS NULL' : '';
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
        if (count($bag) >= $max || !$this->tableExists($table) || !$this->columnExists($table, $col)) {
            return;
        }
        $deleted = $this->columnExists($table, 'deleted_at') ? ' WHERE deleted_at IS NULL' : '';
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
        if (count($bag) >= $max || !$this->tableExists($table)) {
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
            if (in_array($key, ['id', 'created_at', 'updated_at', 'logo_media_id', 'og_image_id', 'background_media_id'], true)) {
                continue;
            }
            if (str_ends_with((string) $key, '_id') || str_ends_with((string) $key, '_at')) {
                continue;
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

    private function tableExists(string $table): bool
    {
        try {
            $this->db->one("SELECT 1 FROM `$table` LIMIT 1");
            return true;
        } catch (\Throwable) {
            return false;
        }
    }

    private function columnExists(string $table, string $col): bool
    {
        try {
            $this->db->one("SELECT `$col` FROM `$table` LIMIT 1");
            return true;
        } catch (\Throwable) {
            return false;
        }
    }
}
