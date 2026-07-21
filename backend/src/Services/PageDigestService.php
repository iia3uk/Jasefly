<?php
declare(strict_types=1);

namespace App\Services;

use App\Database;

/**
 * Short page digests for MCP agents — what is on the page, style cues, widgets.
 */
final class PageDigestService
{
    private SoftDeleteService $softDelete;

    public function __construct(private Database $db)
    {
        $this->softDelete = new SoftDeleteService($db);
    }

    /** @return list<array<string, mixed>> */
    public function all(): array
    {
        if (!$this->tableExists('pages')) {
            return [];
        }
        $where = $this->softDelete->notDeletedClause('pages');
        $rows = $this->db->all(
            "SELECT id, title, slug, status, template, is_home, content, layout_json,
                    seo_title, seo_description, updated_at, created_at
             FROM pages
             WHERE {$where}
             ORDER BY is_home DESC, id ASC"
        );
        return array_map(fn(array $r) => $this->digestRow($r), $rows);
    }

    /** @return array<string, mixed>|null */
    public function one(int|string $idOrSlug): ?array
    {
        if (!$this->tableExists('pages')) {
            return null;
        }
        $where = $this->softDelete->notDeletedClause('pages');
        $row = ctype_digit((string) $idOrSlug)
            ? $this->db->one(
                "SELECT id, title, slug, status, template, is_home, content, layout_json,
                        seo_title, seo_description, updated_at, created_at
                 FROM pages WHERE id=? AND {$where}",
                [(int) $idOrSlug]
            )
            : $this->db->one(
                "SELECT id, title, slug, status, template, is_home, content, layout_json,
                        seo_title, seo_description, updated_at, created_at
                 FROM pages WHERE slug=? AND {$where}",
                [(string) $idOrSlug]
            );
        return $row ? $this->digestRow($row, true) : null;
    }

    /**
     * Site map: pages + nav + key singletons one-liners.
     * @return array<string, mixed>
     */
    public function siteMap(): array
    {
        $pages = $this->all();
        $nav = [];
        if ($this->tableExists('navigation_items')) {
            $where = $this->softDelete->notDeletedClause('navigation_items');
            $nav = $this->db->all(
                "SELECT id, label, href, location, sort_order, is_visible
                 FROM navigation_items
                 WHERE {$where}
                 ORDER BY location, sort_order, id"
            );
        }
        $singletons = [];
        foreach (
            [
                'profile' => ['name', 'job_title', 'short_bio'],
                'hero_settings' => ['headline', 'subheadline', 'badge_text', 'primary_cta_label', 'primary_cta_href'],
                'site_settings' => ['site_name', 'locale', 'maintenance_mode'],
                'seo_settings' => ['site_title', 'site_description'],
                'theme_settings' => ['preset', 'primary_color', 'accent_color', 'font_heading', 'font_body'],
            ] as $table => $cols
        ) {
            if (!$this->tableExists($table)) {
                continue;
            }
            $row = $this->db->one("SELECT * FROM `$table` LIMIT 1");
            if (!$row) {
                continue;
            }
            $brief = [];
            foreach ($cols as $c) {
                if (array_key_exists($c, $row) && $row[$c] !== null && $row[$c] !== '') {
                    $brief[$c] = is_string($row[$c]) ? $this->clip($row[$c], 120) : $row[$c];
                }
            }
            // theme may store JSON blob
            if ($table === 'theme_settings') {
                foreach ($row as $k => $v) {
                    if (in_array($k, ['id', 'created_at', 'updated_at'], true)) {
                        continue;
                    }
                    if (is_string($v) && (str_starts_with($v, '{') || str_starts_with($v, '['))) {
                        $decoded = json_decode($v, true);
                        if (is_array($decoded)) {
                            $brief[$k] = $this->summarizeAssoc($decoded, 8);
                        }
                    } elseif (!isset($brief[$k]) && $v !== null && $v !== '') {
                        $brief[$k] = is_string($v) ? $this->clip($v, 80) : $v;
                    }
                }
            }
            $singletons[$table] = $brief;
        }

        return [
            'pages_count' => count($pages),
            'pages' => $pages,
            'navigation' => $nav,
            'singletons' => $singletons,
            'hint' => 'Чтобы править страницу: cms_page_digest(slug) → cms_update pages/{id} с layout/content. Стиль темы: cms_put_singleton theme.',
        ];
    }

    /**
     * @param array<string, mixed> $row
     * @return array<string, mixed>
     */
    private function digestRow(array $row, bool $detailed = false): array
    {
        $layout = null;
        $raw = $row['layout_json'] ?? null;
        if (is_string($raw) && $raw !== '') {
            $decoded = json_decode($raw, true);
            $layout = json_last_error() === JSON_ERROR_NONE ? $decoded : null;
        } elseif (is_array($raw)) {
            $layout = $raw;
        }

        $layoutInfo = $this->summarizeLayout($layout, $detailed);
        $contentPlain = $this->plain((string) ($row['content'] ?? ''));

        $out = [
            'id' => (int) ($row['id'] ?? 0),
            'title' => (string) ($row['title'] ?? ''),
            'slug' => (string) ($row['slug'] ?? ''),
            'path' => '/' . ltrim((string) ($row['slug'] ?? ''), '/'),
            'status' => (string) ($row['status'] ?? ''),
            'template' => (string) ($row['template'] ?? ''),
            'is_home' => (int) ($row['is_home'] ?? 0) === 1,
            'seo' => [
                'title' => $this->clip((string) ($row['seo_title'] ?? ''), 100),
                'description' => $this->clip((string) ($row['seo_description'] ?? ''), 160),
            ],
            'content_excerpt' => $this->clip($contentPlain, $detailed ? 400 : 180),
            'has_builder_layout' => $layout !== null,
            'layout' => $layoutInfo,
            'summary' => $this->oneLiner($row, $layoutInfo, $contentPlain),
            'updated_at' => $row['updated_at'] ?? null,
        ];

        if ($detailed && is_array($layout)) {
            $out['layout_tree_brief'] = $this->treeBrief($layout);
        }

        return $out;
    }

    /**
     * @param array<string, mixed>|null $layout
     * @return array<string, mixed>
     */
    private function summarizeLayout(?array $layout, bool $detailed): array
    {
        if ($layout === null) {
            return [
                'sections' => 0,
                'widgets' => [],
                'texts' => [],
                'styles' => [],
                'binds' => [],
            ];
        }

        $sections = 0;
        $columns = 0;
        /** @var array<string, int> $widgets */
        $widgets = [];
        $texts = [];
        $styles = [];
        $binds = [];

        $walk = function ($node) use (&$walk, &$sections, &$columns, &$widgets, &$texts, &$styles, &$binds, $detailed): void {
            if (!is_array($node)) {
                return;
            }
            $kind = (string) ($node['kind'] ?? $node['type'] ?? '');
            if ($kind === 'section') {
                $sections++;
            }
            if ($kind === 'column') {
                $columns++;
            }
            $wt = (string) ($node['widgetType'] ?? $node['widget_type'] ?? '');
            if ($wt !== '') {
                $widgets[$wt] = ($widgets[$wt] ?? 0) + 1;
            }

            $props = is_array($node['props'] ?? null) ? $node['props'] : [];
            foreach (['text', 'title', 'label', 'headline', 'subheadline', 'content', 'html', 'caption', 'placeholder'] as $k) {
                if (!empty($props[$k]) && is_string($props[$k])) {
                    $plain = $this->plain($props[$k]);
                    if ($plain !== '') {
                        $texts[] = [
                            'widget' => $wt !== '' ? $wt : ($kind !== '' ? $kind : 'node'),
                            'field' => $k,
                            'text' => $this->clip($plain, $detailed ? 160 : 80),
                        ];
                    }
                }
            }

            $style = $props['style'] ?? $props['styles'] ?? $node['style'] ?? null;
            if (is_array($style)) {
                $picked = $this->pickStyle($style);
                if ($picked !== []) {
                    $styles[] = [
                        'widget' => $wt !== '' ? $wt : $kind,
                        'style' => $picked,
                    ];
                }
            }

            foreach (['bind', 'dataBind', 'binding'] as $bk) {
                if (!empty($props[$bk])) {
                    $binds[] = is_string($props[$bk]) ? $props[$bk] : json_encode($props[$bk], JSON_UNESCAPED_UNICODE);
                }
            }
            if (!empty($props['binds']) && is_array($props['binds'])) {
                foreach ($props['binds'] as $b) {
                    $binds[] = is_string($b) ? $b : json_encode($b, JSON_UNESCAPED_UNICODE);
                }
            }

            foreach ($node['elements'] ?? [] as $child) {
                $walk($child);
            }
            // alternate shapes
            foreach (['children', 'columns', 'rows'] as $alt) {
                if (!empty($node[$alt]) && is_array($node[$alt])) {
                    foreach ($node[$alt] as $child) {
                        $walk($child);
                    }
                }
            }
        };

        if (!empty($layout['elements']) && is_array($layout['elements'])) {
            foreach ($layout['elements'] as $el) {
                $walk($el);
            }
        } else {
            $walk($layout);
        }

        // Dedupe / cap for token budget
        $texts = array_slice($texts, 0, $detailed ? 40 : 12);
        $styles = array_slice($styles, 0, $detailed ? 20 : 8);
        $binds = array_values(array_unique(array_slice($binds, 0, 20)));

        return [
            'sections' => $sections,
            'columns' => $columns,
            'widgets' => $widgets,
            'texts' => $texts,
            'styles' => $styles,
            'binds' => $binds,
        ];
    }

    /**
     * @param array<string, mixed> $style
     * @return array<string, mixed>
     */
    private function pickStyle(array $style): array
    {
        $keys = [
            'color', 'background', 'backgroundColor', 'backgroundImage',
            'fontFamily', 'fontSize', 'fontWeight', 'lineHeight',
            'textAlign', 'padding', 'margin', 'borderRadius',
            'border', 'borderColor', 'boxShadow', 'opacity',
            'maxWidth', 'width', 'height', 'gap', 'display',
            '--accent', '--primary', 'accent', 'primary',
        ];
        $out = [];
        foreach ($keys as $k) {
            if (array_key_exists($k, $style) && $style[$k] !== null && $style[$k] !== '') {
                $v = $style[$k];
                $out[$k] = is_string($v) ? $this->clip($v, 60) : $v;
            }
        }
        // nested theme tokens
        foreach ($style as $k => $v) {
            if (isset($out[$k]) || !is_string($v)) {
                continue;
            }
            if (preg_match('/color|font|bg|accent|primary|radius/i', (string) $k) && count($out) < 12) {
                $out[$k] = $this->clip($v, 60);
            }
        }
        return $out;
    }

    /**
     * @param array<string, mixed> $row
     * @param array<string, mixed> $layoutInfo
     */
    private function oneLiner(array $row, array $layoutInfo, string $contentPlain): string
    {
        $title = (string) ($row['title'] ?? 'Без названия');
        $slug = (string) ($row['slug'] ?? '');
        $home = !empty($row['is_home']) ? ' [HOME]' : '';
        $status = (string) ($row['status'] ?? '');
        $widgets = $layoutInfo['widgets'] ?? [];
        $wList = [];
        if (is_array($widgets)) {
            foreach ($widgets as $name => $cnt) {
                $wList[] = $cnt > 1 ? "{$name}×{$cnt}" : (string) $name;
            }
        }
        $wStr = $wList !== [] ? implode(', ', array_slice($wList, 0, 8)) : 'нет виджетов';
        $excerpt = $this->clip($contentPlain !== '' ? $contentPlain : ($layoutInfo['texts'][0]['text'] ?? ''), 90);
        $stylesNote = !empty($layoutInfo['styles']) ? '; есть кастомные стили' : '';
        return "«{$title}» (/{$slug}){$home} [{$status}] — виджеты: {$wStr}. {$excerpt}{$stylesNote}";
    }

    /**
     * @param array<string, mixed> $layout
     * @return list<array<string, mixed>>
     */
    private function treeBrief(array $layout): array
    {
        $out = [];
        $walk = function ($node, int $depth) use (&$walk, &$out): void {
            if (!is_array($node) || $depth > 6 || count($out) >= 60) {
                return;
            }
            $kind = (string) ($node['kind'] ?? $node['type'] ?? 'node');
            $wt = (string) ($node['widgetType'] ?? '');
            $id = (string) ($node['id'] ?? '');
            $label = $wt !== '' ? $wt : $kind;
            $props = is_array($node['props'] ?? null) ? $node['props'] : [];
            $hint = '';
            foreach (['title', 'text', 'label', 'headline'] as $k) {
                if (!empty($props[$k]) && is_string($props[$k])) {
                    $hint = $this->clip($this->plain($props[$k]), 50);
                    break;
                }
            }
            $out[] = [
                'depth' => $depth,
                'id' => $id,
                'kind' => $label,
                'text' => $hint !== '' ? $hint : null,
            ];
            foreach ($node['elements'] ?? [] as $child) {
                $walk($child, $depth + 1);
            }
        };
        foreach ($layout['elements'] ?? [] as $el) {
            $walk($el, 0);
        }
        return $out;
    }

    /** @param array<string, mixed> $data */
    private function summarizeAssoc(array $data, int $max): array
    {
        $out = [];
        $i = 0;
        foreach ($data as $k => $v) {
            if ($i >= $max) {
                break;
            }
            if (is_array($v)) {
                continue;
            }
            $out[$k] = is_string($v) ? $this->clip($v, 60) : $v;
            $i++;
        }
        return $out;
    }

    private function plain(string $html): string
    {
        $t = html_entity_decode(strip_tags($html), ENT_QUOTES | ENT_HTML5, 'UTF-8');
        $t = preg_replace('/\s+/u', ' ', $t) ?? $t;
        return trim($t);
    }

    private function clip(string $s, int $max): string
    {
        if (mb_strlen($s) <= $max) {
            return $s;
        }
        return rtrim(mb_substr($s, 0, $max - 1)) . '…';
    }

    private function tableExists(string $table): bool
    {
        try {
            return $this->db->inspector()->tableExists($table);
        } catch (\Throwable) {
            try {
                $this->db->one("SELECT 1 FROM `$table` LIMIT 1");
                return true;
            } catch (\Throwable) {
                return false;
            }
        }
    }
}
