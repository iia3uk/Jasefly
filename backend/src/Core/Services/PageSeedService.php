<?php
declare(strict_types=1);

namespace App\Core\Services;

use App\Core\Contract\ModuleInterface;
use App\Database;
use App\Utils\HtmlSanitizer;
use App\Utils\Str;

/**
 * Creates plugin-declared demo/default pages into the `pages` table.
 *
 * Strictly additive and idempotent: a page is inserted only when no row with
 * the same slug exists. Existing pages (including the home page and any
 * user-created content) are NEVER modified or deleted — this is the core
 * safety guarantee so enabling a plugin or re-seeding never breaks current
 * content (WordPress-style plugin pages).
 *
 * Driven by {@see ModuleInterface::demoPages()}.
 */
final class PageSeedService
{
    public function __construct(
        private Database $db,
    ) {}

    /**
     * Seed all demo pages declared by an iterable of modules (typically the
     * enabled modules from the registry).
     *
     * @param iterable<ModuleInterface> $modules
     * @return array{created:int, skipped:int, pages:list<array{module:string,slug:string,title:string,status:string}>}
     */
    public function seedAll(iterable $modules): array
    {
        $created = 0;
        $skipped = 0;
        $pages = [];
        foreach ($modules as $module) {
            $r = $this->seedModule($module);
            $created += $r['created'];
            $skipped += $r['skipped'];
            foreach ($r['pages'] as $p) {
                $pages[] = $p;
            }
        }
        return ['created' => $created, 'skipped' => $skipped, 'pages' => $pages];
    }

    /**
     * Seed one module's declared demo pages.
     *
     * @return array{created:int, skipped:int, pages:list<array{module:string,slug:string,title:string,status:string}>, errors:list<string>}
     */
    public function seedModule(ModuleInterface $module): array
    {
        $created = 0;
        $skipped = 0;
        $pages = [];
        $errors = [];
        $modName = $module->name();

        foreach ($module->demoPages() as $entry) {
            $slug = Str::slug((string) ($entry['slug'] ?? ''));
            $title = trim((string) ($entry['title'] ?? ''));
            if ($slug === '' || $title === '') {
                $errors[] = "$modName: page entry missing slug/title — skipped";
                continue;
            }
            try {
                if ($this->slugExists($slug)) {
                    $skipped++;
                    $pages[] = ['module' => $modName, 'slug' => $slug, 'title' => $title, 'status' => 'skipped'];
                    continue;
                }
                $this->insertPage($entry, $slug, $title);
                $created++;
                $pages[] = ['module' => $modName, 'slug' => $slug, 'title' => $title, 'status' => 'created'];
            } catch (\Throwable $e) {
                $errors[] = "$modName/$slug: " . $e->getMessage();
                $skipped++;
                $pages[] = ['module' => $modName, 'slug' => $slug, 'title' => $title, 'status' => 'error'];
            }
        }

        return [
            'created' => $created,
            'skipped' => $skipped,
            'pages' => $pages,
            'errors' => $errors,
        ];
    }

    private function slugExists(string $slug): bool
    {
        // Direct check (pages has no deleted_at column — avoid SlugService which
        // assumes deleted_at).
        return $this->db->one('SELECT id FROM pages WHERE slug = ?', [$slug]) !== null;
    }

    /**
     * Создать недостающие страницы и заполнить layout только если он пустой
     * (не перезаписывает уже отредактированные шаблоны).
     *
     * @param list<array<string, mixed>> $entries
     * @return array{created:int, filled:int, skipped:int, marked_seed:int}
     */
    public function ensureEntries(array $entries): array
    {
        $created = 0;
        $filled = 0;
        $skipped = 0;
        foreach ($entries as $entry) {
            $slug = Str::slug((string) ($entry['slug'] ?? ''));
            $title = trim((string) ($entry['title'] ?? ''));
            if ($slug === '' || $title === '') {
                continue;
            }
            $row = $this->db->one('SELECT id, layout_json, status, template FROM pages WHERE slug = ?', [$slug]);
            if (!$row) {
                $this->insertPage($entry, $slug, $title);
                $created++;
                continue;
            }
            if (empty($entry['layout'])) {
                $skipped++;
                continue;
            }
            $raw = trim((string) ($row['layout_json'] ?? ''));
            $hasLayout = $raw !== '' && $raw !== 'null' && $raw !== '{"version":1,"elements":[]}';
            $canRefresh = !$hasLayout || $this->isRefreshableSeedLayout($raw, $slug, $entry);
            if (!$canRefresh) {
                $skipped++;
                continue;
            }
            $layoutJson = json_encode($entry['layout'], JSON_UNESCAPED_UNICODE);
            $this->db->run(
                'UPDATE pages SET layout_json=?, template=?, status=?, title=COALESCE(NULLIF(title, \'\'), ?), seo_title=COALESCE(seo_title, ?), seo_description=COALESCE(seo_description, ?) WHERE id=?',
                [
                    $layoutJson,
                    (string) ($entry['template'] ?? 'system'),
                    in_array((string) ($entry['status'] ?? ''), ['draft', 'published'], true)
                        ? (string) $entry['status']
                        : 'published',
                    $title,
                    (string) ($entry['seo_title'] ?? $title) ?: null,
                    (string) ($entry['seo_description'] ?? '') ?: null,
                    $row['id'],
                ],
            );
            $filled++;
        }
        $marked = $this->markSeedLayouts(
            array_values(array_filter(array_map(
                static fn(array $e): string => Str::slug((string) ($e['slug'] ?? '')),
                $entries,
            ))),
        );
        return ['created' => $created, 'filled' => $filled, 'skipped' => $skipped, 'marked_seed' => $marked];
    }

    /**
     * Обновить layout только для commerce-заготовок без актуального шаблона.
     * Обычные seed-страницы (about, blog…) не перезаписываются повторно.
     *
     * @param array<string, mixed> $entry
     */
    private function isRefreshableSeedLayout(string $raw, string $slug, array $entry): bool
    {
        $layout = json_decode($raw, true);
        if (!is_array($layout)) {
            return true;
        }
        $meta = is_array($layout['meta'] ?? null) ? $layout['meta'] : [];
        // Пользователь сохранил в билдере для сайта — не трогаем.
        if (!empty($meta['useOnSite']) && empty($meta['seed'])) {
            return false;
        }

        if ($this->isCommerceSlug($slug)) {
            if (!empty($meta['useOnSite']) && $this->layoutHasCommerceWidgets($raw, $slug)) {
                return false;
            }
            return true;
        }

        // Portfolio / site seed stubs: refresh while still marked seed or sparse placeholder.
        if ($this->isPortfolioSeedSlug($slug)) {
            if (!empty($meta['seed'])) {
                return true;
            }
            return $this->isSparsePlaceholderLayout($raw);
        }

        return false;
    }

    private function isPortfolioSeedSlug(string $slug): bool
    {
        return in_array($slug, ['about', 'contact', 'blog', 'projects', 'services'], true);
    }

    private function isSparsePlaceholderLayout(string $raw): bool
    {
        $markers = [
            'Оформите обложку раздела',
            'Карточки проектов — по /projects',
            'Добавьте заголовок и при необходимости виджеты',
            'Оформите раздел услуг в конструкторе',
            'Расскажите о себе, опыте и подходе',
            'Добавьте виджеты профиля',
        ];
        foreach ($markers as $m) {
            if (str_contains($raw, $m)) {
                return true;
            }
        }
        $layout = json_decode($raw, true);
        if (!is_array($layout)) {
            return true;
        }
        $types = $this->collectWidgetTypes($layout['elements'] ?? []);
        if ($types === []) {
            return true;
        }
        foreach ($types as $t) {
            if ($t !== 'heading' && $t !== 'text') {
                return false;
            }
        }
        return true;
    }

    /**
     * @param list<array<string, mixed>> $els
     * @return list<string>
     */
    private function collectWidgetTypes(array $els): array
    {
        $out = [];
        foreach ($els as $el) {
            if (($el['elType'] ?? '') === 'widget' && !empty($el['widgetType'])) {
                $out[] = (string) $el['widgetType'];
            }
            if (!empty($el['elements']) && is_array($el['elements'])) {
                foreach ($this->collectWidgetTypes($el['elements']) as $t) {
                    $out[] = $t;
                }
            }
        }
        return $out;
    }

    private function isCommerceSlug(string $slug): bool
    {
        if (str_starts_with($slug, 'product-detail')) {
            return true;
        }
        return in_array($slug, [
            'payment', 'payment-success', 'payment-fail', 'offer', 'products',
            'product-card',
        ], true);
    }

    private function layoutHasCommerceWidgets(string $raw, string $slug): bool
    {
        if (str_starts_with($slug, 'product-detail')) {
            return str_contains($raw, '"product_template"')
                || str_contains($raw, '"widgetType":"product-variants"')
                || str_contains($raw, '"widgetType":"product-buy"');
        }
        return match ($slug) {
            'payment' => str_contains($raw, '"widgetType":"payment-checkout"'),
            'offer' => str_contains($raw, '"widgetType":"offer-document"'),
            'products' => str_contains($raw, '"widgetType":"products-grid"'),
            'product-card' => str_contains($raw, '"widgetType":"product-price"')
                || str_contains($raw, '"text_dynamic":true'),
            'payment-success', 'payment-fail' => str_contains($raw, '"widgetType":"heading"')
                || str_contains($raw, '"widgetType":"text"'),
            default => false,
        };
    }

    /**
     * Пометить уже залитые пустышки meta.seed=true, чтобы сайт снова показывал
     * классические страницы с реальными данными (проекты, блог и т.д.).
     *
     * @param list<string> $slugs
     */
    public function markSeedLayouts(array $slugs): int
    {
        if ($slugs === []) {
            return 0;
        }
        $markers = [];
        if (class_exists(\App\Modules\System\SystemTemplates::class)) {
            $markers = \App\Modules\System\SystemTemplates::seedMarkers();
        }
        $marked = 0;
        foreach ($slugs as $slug) {
            if ($slug === '') {
                continue;
            }
            $row = $this->db->one('SELECT id, layout_json FROM pages WHERE slug = ?', [$slug]);
            if (!$row) {
                continue;
            }
            $raw = trim((string) ($row['layout_json'] ?? ''));
            if ($raw === '' || $raw === 'null') {
                continue;
            }
            $layout = json_decode($raw, true);
            if (!is_array($layout) || empty($layout['elements'])) {
                continue;
            }
            $meta = is_array($layout['meta'] ?? null) ? $layout['meta'] : [];
            if (!empty($meta['useOnSite'])) {
                continue; // пользователь уже активировал шаблон на сайте
            }
            if (!empty($meta['seed'])) {
                continue;
            }
            $blob = $raw;
            $looksLikeSeed = false;
            foreach ($markers as $m) {
                if ($m !== '' && str_contains($blob, $m)) {
                    $looksLikeSeed = true;
                    break;
                }
            }
            // admin-login / contact / lazy-loader заготовки без маркеров текста
            if (!$looksLikeSeed && in_array($slug, ['admin-login', 'contact', 'not-found', 'lazy-loader'], true)) {
                $looksLikeSeed = str_contains($blob, '"widgetType":"auth-login"')
                    || str_contains($blob, '"widgetType":"contact-form"')
                    || str_contains($blob, '"widgetType":"page-loader"')
                    || str_contains($blob, 'sec_sys')
                    || str_contains($blob, 'sec_auth')
                    || str_contains($blob, 'sec_loader');
            }
            if (!$looksLikeSeed) {
                continue;
            }
            $layout['meta'] = array_merge($meta, ['seed' => true]);
            $this->db->run('UPDATE pages SET layout_json=? WHERE id=?', [
                json_encode($layout, JSON_UNESCAPED_UNICODE),
                $row['id'],
            ]);
            $marked++;
        }
        return $marked;
    }

    /** @param array<string,mixed> $entry */
    private function insertPage(array $entry, string $slug, string $title): void
    {
        $content = (string) ($entry['content'] ?? '');
        if ($content !== '') {
            $content = HtmlSanitizer::clean($content);
        }
        $layoutJson = null;
        if (array_key_exists('layout', $entry)) {
            $layout = $entry['layout'];
            $layoutJson = is_array($layout) || is_object($layout)
                ? json_encode($layout, JSON_UNESCAPED_UNICODE)
                : (string) $layout;
            if ($layoutJson === '') {
                $layoutJson = null;
            }
        } elseif (array_key_exists('layout_json', $entry)) {
            $layoutJson = (string) $entry['layout_json'] ?: null;
        }

        $status = in_array((string) ($entry['status'] ?? ''), ['draft', 'published'], true)
            ? (string) $entry['status']
            : 'published';
        $template = (string) ($entry['template'] ?? 'default');
        // Plugins must never steal the home slot — force is_home = 0.
        $isHome = 0;

        $this->db->run(
            'INSERT INTO pages (title, slug, content, layout_json, status, seo_title, seo_description, template, is_home)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [
                $title,
                $slug,
                $content !== '' ? $content : null,
                $layoutJson,
                $status,
                (string) ($entry['seo_title'] ?? '') ?: null,
                (string) ($entry['seo_description'] ?? '') ?: null,
                $template !== '' ? $template : 'default',
                $isHome,
            ],
        );
    }
}
