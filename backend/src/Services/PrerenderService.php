<?php
declare(strict_types=1);

namespace App\Services;

use App\Database;
use App\Utils\HtmlSanitizer;

/**
 * Dynamic rendering for crawlers: semantic HTML + meta from DB.
 * Humans still get the SPA; bots hitting via .htaccess get this snapshot.
 */
final class PrerenderService
{
    private const CACHE_TTL = 3600;

    /** @var list<string> */
    public const BOT_MARKERS = [
        'googlebot', 'bingbot', 'slurp', 'duckduckbot', 'baiduspider', 'yandex',
        'facebookexternalhit', 'facebot', 'twitterbot', 'linkedinbot', 'whatsapp',
        'telegrambot', 'discordbot', 'applebot', 'petalbot', 'semrushbot',
        'ahrefsbot', 'mj12bot', 'dotbot', 'bytespider', 'gptbot', 'claudebot',
        'storebot-google', 'google-inspectiontool', 'chrome-lighthouse',
    ];

    public function __construct(
        private Database $db,
        private array $app,
    ) {}

    public static function isBot(?string $ua): bool
    {
        $ua = strtolower((string) $ua);
        if ($ua === '') {
            return false;
        }
        foreach (self::BOT_MARKERS as $m) {
            if (str_contains($ua, $m)) {
                return true;
            }
        }
        return false;
    }

    /**
     * Inject title / description / OG / lang into the Vite SPA shell (for humans + Webmaster tools).
     * Bots still get full prerender HTML via prerender.php / index.php bot branch.
     */
    public function enrichSpaHtml(string $html, string $path): string
    {
        $path = $this->normalizePath($path);
        if ($html === '' || $this->isBlockedPath($path)) {
            return $html;
        }

        try {
            $page = $this->resolve($path);
        } catch (\Throwable) {
            return $html;
        }
        if (!empty($page['redirect'])) {
            return $html;
        }

        $seo = $this->db->one('SELECT * FROM seo_settings LIMIT 1') ?: [];
        $site = $this->db->one('SELECT * FROM site_settings LIMIT 1') ?: [];
        $lang = strtolower(trim((string) ($site['locale'] ?? $site['language'] ?? 'ru')));
        if ($lang === '' || strlen($lang) > 8) {
            $lang = 'ru';
        }
        $lang = substr($lang, 0, 2);

        $title = trim((string) ($page['title'] ?? ''));
        if ($title === '') {
            $title = (string) ($seo['site_title'] ?? $site['site_name'] ?? 'Jasefly');
        }
        $desc = trim((string) ($page['description'] ?? ''));
        if ($desc === '') {
            $desc = (string) ($seo['site_description'] ?? '');
        }
        $base = rtrim((string) ($seo['canonical_base_url'] ?? $this->app['url'] ?? $this->app['app_url'] ?? ''), '/');
        $canonical = $base !== '' ? $base . ($path === '/' ? '/' : $path) : '';
        $ogTitle = trim((string) ($seo['og_title'] ?? $title));
        $ogDesc = trim((string) ($seo['og_description'] ?? $desc));
        $ogImage = $page['og_image'] ?? null;
        if (!is_string($ogImage) || $ogImage === '') {
            $ogImage = !empty($seo['og_image_url']) ? (string) $seo['og_image_url'] : null;
        }

        $titleEsc = $this->e($title);
        $descEsc = $this->e($desc);
        $ogTitleEsc = $this->e($ogTitle);
        $ogDescEsc = $this->e($ogDesc);
        $canonEsc = $this->e($canonical);
        $langEsc = $this->e($lang);

        if (preg_match('/<html\b[^>]*>/i', $html)) {
            $html = preg_replace('/<html\b[^>]*>/i', '<html lang="' . $langEsc . '">', $html, 1) ?? $html;
        }

        if (preg_match('/<title\b[^>]*>.*?<\/title>/is', $html)) {
            $html = preg_replace('/<title\b[^>]*>.*?<\/title>/is', '<title>' . $titleEsc . '</title>', $html, 1) ?? $html;
        } else {
            $html = preg_replace('/<\/head>/i', "<title>{$titleEsc}</title>\n</head>", $html, 1) ?? $html;
        }

        $meta = [];
        $meta[] = '<meta name="description" content="' . $descEsc . '">';
        if ($canonical !== '') {
            $meta[] = '<link rel="canonical" href="' . $canonEsc . '">';
        }
        $meta[] = '<meta property="og:type" content="website">';
        $meta[] = '<meta property="og:title" content="' . $ogTitleEsc . '">';
        $meta[] = '<meta property="og:description" content="' . $ogDescEsc . '">';
        if ($canonical !== '') {
            $meta[] = '<meta property="og:url" content="' . $canonEsc . '">';
        }
        if (is_string($ogImage) && $ogImage !== '') {
            $meta[] = '<meta property="og:image" content="' . $this->e($ogImage) . '">';
        }
        $meta[] = '<meta name="twitter:card" content="summary_large_image">';
        $meta[] = '<meta name="twitter:title" content="' . $ogTitleEsc . '">';
        $meta[] = '<meta name="twitter:description" content="' . $ogDescEsc . '">';
        $meta[] = '<meta name="jasefly-spa-shell" content="1">';
        $jsonLd = $this->seoJsonLdTag($seo, $site, $base, $title, $desc);
        if ($jsonLd !== '') {
            $meta[] = $jsonLd;
        }
        $block = implode("\n", $meta) . "\n";

        // Drop stale description / og from the static shell, then inject fresh tags.
        $html = preg_replace('/<meta\s+name=["\']description["\'][^>]*>\s*/i', '', $html) ?? $html;
        $html = preg_replace('/<meta\s+property=["\']og:[^"\']+["\'][^>]*>\s*/i', '', $html) ?? $html;
        $html = preg_replace('/<meta\s+name=["\']twitter:[^"\']+["\'][^>]*>\s*/i', '', $html) ?? $html;
        $html = preg_replace('/<link\s+rel=["\']canonical["\'][^>]*>\s*/i', '', $html) ?? $html;
        $html = preg_replace(
            '/<script\s+type=["\']application\/ld\+json["\']\s+data-jasefly-seo=["\']1["\'][^>]*>.*?<\/script>\s*/is',
            '',
            $html
        ) ?? $html;

        if (preg_match('/<\/head>/i', $html)) {
            $html = preg_replace('/<\/head>/i', $block . '</head>', $html, 1) ?? $html;
        }

        return $html;
    }

    public function cacheDir(): string
    {
        $dir = rtrim((string) ($this->app['storage'] ?? dirname(__DIR__, 2) . '/storage'), '/\\')
            . '/cache/prerender';
        if (!is_dir($dir)) {
            @mkdir($dir, 0755, true);
        }
        return $dir;
    }

    public function flushCache(): int
    {
        $dir = $this->cacheDir();
        $n = 0;
        foreach (glob($dir . '/*.html') ?: [] as $f) {
            if (@unlink($f)) {
                $n++;
            }
        }
        return $n;
    }

    /**
     * @return array{status:int, html:string, cached:bool}
     */
    public function render(string $path, bool $useCache = true): array
    {
        $path = $this->normalizePath($path);
        if ($this->isBlockedPath($path)) {
            return ['status' => 404, 'html' => $this->document('Not found', 'Страница не найдена', $path, '<p>Not found</p>', 404), 'cached' => false];
        }

        $cacheFile = $this->cacheDir() . '/' . sha1('v4:' . $path) . '.html';
        if ($useCache && is_file($cacheFile) && (time() - filemtime($cacheFile)) < self::CACHE_TTL) {
            $html = (string) file_get_contents($cacheFile);
            $status = str_contains($html, 'data-prerender-status="404"') ? 404 : 200;
            return ['status' => $status, 'html' => $html, 'cached' => true];
        }

        $page = $this->resolve($path);
        if (!empty($page['redirect']) && in_array((int) $page['status'], [301, 302], true)) {
            return [
                'status' => (int) $page['status'],
                'html' => '',
                'cached' => false,
                'redirect' => (string) $page['redirect'],
            ];
        }
        $html = $this->document(
            $page['title'],
            $page['description'],
            $path,
            $page['body'],
            $page['status'],
            $page['og_image'] ?? null,
        );
        @file_put_contents($cacheFile, $html);
        return ['status' => $page['status'], 'html' => $html, 'cached' => false];
    }

    private function normalizePath(string $path): string
    {
        $path = parse_url($path, PHP_URL_PATH) ?? $path;
        $path = '/' . trim(str_replace('\\', '/', (string) $path), '/');
        if ($path !== '/') {
            $path = rtrim($path, '/');
        }
        return $path === '' ? '/' : $path;
    }

    private function isBlockedPath(string $path): bool
    {
        return str_starts_with($path, '/admin')
            || str_starts_with($path, '/api')
            || $path === '/lazy-loader';
    }

    /**
     * @return array{title:string, description:string, body:string, status:int, og_image?:?string}
     */
    private function resolve(string $path): array
    {
        (new PageScheduleService($this->db))->promoteDue();

        // Manual redirects for bots/crawlers hitting old URLs
        $redir = (new PathRedirectService($this->db))->resolve($path);
        if ($redir) {
            $location = $redir['to_path'];
            if (!preg_match('#^https?://#i', $location)) {
                $location = PathRedirectService::normalize($location);
            }
            return [
                'title' => 'Redirect',
                'description' => '',
                'body' => '<p>Moved to <a href="' . $this->e($location) . '">' . $this->e($location) . '</a></p>',
                'status' => $redir['status_code'],
                'redirect' => $location,
            ];
        }

        $seo = $this->db->one('SELECT * FROM seo_settings LIMIT 1') ?: [];
        $site = $this->db->one('SELECT * FROM site_settings LIMIT 1') ?: [];
        $siteName = (string) ($site['site_name'] ?? $this->app['app_name'] ?? 'Portfolio');
        $defaultDesc = (string) ($seo['site_description'] ?? '');

        if ($path === '/') {
            return $this->homePage($siteName, $defaultDesc, $seo);
        }
        if ($path === '/about') {
            return $this->aboutPage($siteName, $defaultDesc);
        }
        if ($path === '/projects') {
            return $this->projectsIndex($siteName, $defaultDesc);
        }
        if (preg_match('#^/projects/([^/]+)$#', $path, $m)) {
            return $this->projectDetail($m[1], $siteName);
        }
        if ($path === '/blog') {
            return $this->blogIndex($siteName, $defaultDesc);
        }
        if (preg_match('#^/blog/([^/]+)$#', $path, $m)) {
            return $this->blogDetail($m[1], $siteName);
        }
        if ($path === '/services') {
            return $this->servicesPage($siteName, $defaultDesc);
        }
        if ($path === '/contact') {
            return $this->contactPage($siteName, $defaultDesc);
        }
        if ($path === '/privacy') {
            return $this->cmsOrFallback('privacy', 'Политика конфиденциальности', $siteName, $defaultDesc);
        }

        $slug = ltrim($path, '/');
        if ($slug !== '' && !str_contains($slug, '/')) {
            return $this->cmsOrFallback($slug, $slug, $siteName, $defaultDesc);
        }

        return [
            'title' => 'Страница не найдена · ' . $siteName,
            'description' => $defaultDesc,
            'body' => '<h1>Страница не найдена</h1><p><a href="/">На главную</a></p>',
            'status' => 404,
        ];
    }

    /** @param array<string,mixed> $seo */
    private function homePage(string $siteName, string $defaultDesc, array $seo): array
    {
        $home = $this->db->one("SELECT * FROM pages WHERE is_home=1 AND status='published' LIMIT 1");
        $hero = $this->db->one('SELECT * FROM hero_settings LIMIT 1') ?: [];
        $profile = $this->db->one('SELECT * FROM profile LIMIT 1') ?: [];

        $title = trim((string) (
            ($home['seo_title'] ?? '') !== ''
                ? $home['seo_title']
                : ($seo['site_title'] ?? $siteName)
        ));
        // Meta description: explicit SEO fields only — never steal a random H2 from layout.
        $desc = $this->pickMetaDescription([
            (string) ($home['seo_description'] ?? ''),
            (string) ($seo['site_description'] ?? ''),
            (string) ($seo['og_description'] ?? ''),
            (string) ($hero['subheadline'] ?? ''),
            (string) ($profile['short_bio'] ?? ''),
            $defaultDesc,
        ]);

        $ogImage = $this->mediaPublicUrl($home['og_image_id'] ?? null)
            ?? (!empty($seo['og_image_url']) ? (string) $seo['og_image_url'] : null);

        if ($home && $this->pageHasLiveLayout($home)) {
            $extracted = $this->extractFromPage($home);
            $body = $extracted['body'];
            if ($body === '') {
                $body = '<h1>' . $this->e($title) . '</h1>';
                if ($desc !== '') {
                    $body .= '<p>' . $this->e($desc) . '</p>';
                }
            }
            // Append blog index only if layout has no blog-list widget.
            if (!str_contains($body, 'href="/blog/')) {
                $body .= $this->blogIndexSnippet();
            }
            return [
                'title' => $title,
                'description' => $this->plain($desc, 160),
                'body' => $body,
                'status' => 200,
                'og_image' => $ogImage,
            ];
        }

        $h1 = trim((string) ($hero['headline'] ?? $profile['name'] ?? $siteName));
        $sub = trim((string) ($hero['subheadline'] ?? $profile['short_bio'] ?? $desc));
        $parts = ['<h1>' . $this->e($h1) . '</h1>'];
        if ($sub !== '') {
            $parts[] = '<p>' . $this->e($sub) . '</p>';
        }

        $projects = $this->db->all(
            "SELECT title, slug, short_description FROM projects WHERE status='published' ORDER BY is_featured DESC, sort_order, id DESC LIMIT 12"
        );
        if ($projects) {
            $parts[] = '<h2>Проекты</h2><ul>';
            foreach ($projects as $p) {
                $parts[] = '<li><a href="/projects/' . $this->e((string) $p['slug']) . '"><strong>'
                    . $this->e((string) $p['title']) . '</strong></a>'
                    . ($p['short_description'] ? ' — ' . $this->e((string) $p['short_description']) : '')
                    . '</li>';
            }
            $parts[] = '</ul>';
        }

        $parts[] = $this->blogIndexSnippet();

        return [
            'title' => $title,
            'description' => $this->plain($desc !== '' ? $desc : $sub, 160),
            'body' => implode("\n", $parts),
            'status' => 200,
            'og_image' => $ogImage,
        ];
    }

    /** Prefer longer SEO blurbs over short section titles. */
    /** @param list<string> $candidates */
    private function pickMetaDescription(array $candidates): string
    {
        $best = '';
        foreach ($candidates as $c) {
            $c = trim(preg_replace('/\s+/u', ' ', strip_tags($c)) ?? '');
            if ($c === '') {
                continue;
            }
            // Skip obvious section headings (too short / no sentence end).
            if (mb_strlen($c) < 40 && !preg_match('/[.!?…]/u', $c)) {
                continue;
            }
            if ($best === '' || mb_strlen($c) > mb_strlen($best)) {
                $best = $c;
            }
            // Prefer first solid candidate ≥ 80 chars (usually site_description / og).
            if (mb_strlen($c) >= 80) {
                return $c;
            }
        }
        if ($best !== '') {
            return $best;
        }
        foreach ($candidates as $c) {
            $c = trim($c);
            if ($c !== '') {
                return $c;
            }
        }
        return '';
    }

    private function blogIndexSnippet(int $limit = 8, ?string $heading = 'Блог'): string
    {
        $limit = max(1, min(20, $limit));
        $posts = $this->db->all(
            "SELECT title, slug FROM blog_posts WHERE status='published' ORDER BY published_at DESC, id DESC LIMIT {$limit}"
        );
        if ($posts === []) {
            return '';
        }
        $parts = [];
        if ($heading !== null && $heading !== '') {
            $parts[] = '<h2>' . $this->e($heading) . '</h2>';
        }
        $parts[] = '<ul>';
        foreach ($posts as $p) {
            $parts[] = '<li><a href="/blog/' . $this->e((string) $p['slug']) . '">'
                . $this->e((string) $p['title']) . '</a></li>';
        }
        $parts[] = '</ul>';
        return implode("\n", $parts);
    }

    private function aboutPage(string $siteName, string $defaultDesc): array
    {
        $cms = $this->publishedPage('about');
        if ($cms && $this->pageHasLiveLayout($cms)) {
            return $this->fromCmsPage($cms, $siteName, $defaultDesc);
        }
        $profile = $this->db->one('SELECT * FROM profile LIMIT 1') ?: [];
        $name = (string) ($profile['name'] ?? 'Обо мне');
        $bio = (string) ($profile['bio'] ?? $profile['short_bio'] ?? $defaultDesc);
        $body = '<h1>' . $this->e($name) . '</h1>' . $this->rich($bio);
        return [
            'title' => 'Обо мне · ' . $siteName,
            'description' => $this->plain((string) ($profile['short_bio'] ?? $defaultDesc), 160),
            'body' => $body,
            'status' => 200,
        ];
    }

    private function projectsIndex(string $siteName, string $defaultDesc): array
    {
        $cms = $this->publishedPage('projects');
        // Seed/cover stubs must not hide the real project list for crawlers.
        $rows = $this->db->all(
            "SELECT title, slug, short_description FROM projects WHERE status='published' ORDER BY sort_order, published_at DESC, id DESC"
        );
        $parts = ['<h1>Проекты</h1>'];
        if ($cms && $this->pageHasLiveLayout($cms)) {
            $from = $this->fromCmsPage($cms, $siteName, $defaultDesc);
            $parts = [$from['body']];
        }
        $parts[] = '<ul>';
        foreach ($rows as $p) {
            $parts[] = '<li><a href="/projects/' . $this->e((string) $p['slug']) . '"><strong>'
                . $this->e((string) $p['title']) . '</strong></a>'
                . ($p['short_description'] ? '<p>' . $this->e((string) $p['short_description']) . '</p>' : '')
                . '</li>';
        }
        $parts[] = '</ul>';
        return [
            'title' => 'Проекты · ' . $siteName,
            'description' => $defaultDesc !== '' ? $defaultDesc : 'Портфолио проектов',
            'body' => implode("\n", $parts),
            'status' => 200,
        ];
    }

    private function projectDetail(string $slug, string $siteName): array
    {
        $p = $this->db->one("SELECT * FROM projects WHERE slug=? AND status='published'", [$slug]);
        if (!$p) {
            return [
                'title' => 'Не найдено · ' . $siteName,
                'description' => '',
                'body' => '<h1>Проект не найден</h1>',
                'status' => 404,
            ];
        }
        $title = (string) $p['title'];
        $desc = $this->plain((string) ($p['short_description'] ?? ''), 160);
        $body = '<h1>' . $this->e($title) . '</h1>';
        if (!empty($p['short_description'])) {
            $body .= '<p>' . $this->e((string) $p['short_description']) . '</p>';
        }
        $body .= $this->rich((string) ($p['description'] ?? $p['content'] ?? ''));
        $body .= '<p><a href="/projects">Все проекты</a></p>';
        return [
            'title' => $title . ' · ' . $siteName,
            'description' => $desc,
            'body' => $body,
            'status' => 200,
            'og_image' => $this->mediaPublicUrl($p['og_image_id'] ?? $p['cover_media_id'] ?? null),
        ];
    }

    private function blogIndex(string $siteName, string $defaultDesc): array
    {
        $rows = $this->db->all(
            "SELECT title, slug, excerpt, published_at FROM blog_posts WHERE status='published' ORDER BY published_at DESC, id DESC"
        );
        $parts = ['<h1>Блог</h1><ul>'];
        foreach ($rows as $p) {
            $parts[] = '<li><a href="/blog/' . $this->e((string) $p['slug']) . '">'
                . $this->e((string) $p['title']) . '</a>'
                . ($p['excerpt'] ? '<p>' . $this->e((string) $p['excerpt']) . '</p>' : '')
                . '</li>';
        }
        $parts[] = '</ul>';
        return [
            'title' => 'Блог · ' . $siteName,
            'description' => $defaultDesc !== '' ? $defaultDesc : 'Статьи и заметки',
            'body' => implode("\n", $parts),
            'status' => 200,
        ];
    }

    private function blogDetail(string $slug, string $siteName): array
    {
        $p = $this->db->one("SELECT * FROM blog_posts WHERE slug=? AND status='published'", [$slug]);
        if (!$p) {
            return [
                'title' => 'Не найдено · ' . $siteName,
                'description' => '',
                'body' => '<h1>Запись не найдена</h1>',
                'status' => 404,
            ];
        }
        $title = (string) ($p['seo_title'] ?: $p['title']);
        $desc = $this->plain((string) ($p['seo_description'] ?: $p['excerpt'] ?? ''), 160);
        $body = '<h1>' . $this->e((string) $p['title']) . '</h1>' . $this->rich((string) ($p['content'] ?? ''));
        $body .= '<p><a href="/blog">К блогу</a></p>';
        return [
            'title' => $title . ' · ' . $siteName,
            'description' => $desc,
            'body' => $body,
            'status' => 200,
            'og_image' => $this->mediaPublicUrl($p['og_image_id'] ?? $p['cover_media_id'] ?? null),
        ];
    }

    private function servicesPage(string $siteName, string $defaultDesc): array
    {
        $rows = $this->db->all(
            'SELECT title, short_description, description FROM services WHERE is_visible=1 ORDER BY sort_order, id'
        );
        $parts = ['<h1>Услуги</h1><ul>'];
        foreach ($rows as $s) {
            $text = (string) ($s['short_description'] ?: $s['description'] ?? '');
            $parts[] = '<li><strong>' . $this->e((string) $s['title']) . '</strong>'
                . ($text !== '' ? '<p>' . $this->e($this->plain($text, 300)) . '</p>' : '')
                . '</li>';
        }
        $parts[] = '</ul>';
        return [
            'title' => 'Услуги · ' . $siteName,
            'description' => $defaultDesc,
            'body' => implode("\n", $parts),
            'status' => 200,
        ];
    }

    private function contactPage(string $siteName, string $defaultDesc): array
    {
        $info = $this->db->one('SELECT * FROM contact_info LIMIT 1') ?: [];
        $parts = ['<h1>Контакты</h1>'];
        if (!empty($info['email'])) {
            $parts[] = '<p>Email: <a href="mailto:' . $this->e((string) $info['email']) . '">'
                . $this->e((string) $info['email']) . '</a></p>';
        }
        if (!empty($info['phone'])) {
            $parts[] = '<p>Телефон: ' . $this->e((string) $info['phone']) . '</p>';
        }
        if (!empty($info['address'])) {
            $parts[] = '<p>' . $this->e((string) $info['address']) . '</p>';
        }
        $cms = $this->publishedPage('contact');
        if ($cms && $this->pageHasLiveLayout($cms)) {
            $from = $this->fromCmsPage($cms, $siteName, $defaultDesc);
            return $from;
        }
        return [
            'title' => 'Контакты · ' . $siteName,
            'description' => $defaultDesc,
            'body' => implode("\n", $parts),
            'status' => 200,
        ];
    }

    private function cmsOrFallback(string $slug, string $fallbackTitle, string $siteName, string $defaultDesc): array
    {
        $page = $this->publishedPage($slug);
        if (!$page) {
            return [
                'title' => $fallbackTitle . ' · ' . $siteName,
                'description' => $defaultDesc,
                'body' => '<h1>' . $this->e($fallbackTitle) . '</h1>',
                'status' => 404,
            ];
        }
        return $this->fromCmsPage($page, $siteName, $defaultDesc);
    }

    /** @param array<string,mixed> $page */
    private function fromCmsPage(array $page, string $siteName, string $defaultDesc): array
    {
        $extracted = $this->extractFromPage($page);
        $title = (string) ($page['seo_title'] ?: $page['title'] ?: 'Страница');
        $desc = (string) ($page['seo_description'] ?: $extracted['description'] ?: $defaultDesc);
        $body = $extracted['body'] !== ''
            ? $extracted['body']
            : ('<h1>' . $this->e((string) $page['title']) . '</h1>' . $this->rich((string) ($page['content'] ?? '')));
        return [
            'title' => $title . (str_contains($title, $siteName) ? '' : ' · ' . $siteName),
            'description' => $this->plain($desc, 160),
            'body' => $body,
            'status' => 200,
            'og_image' => $this->mediaPublicUrl($page['og_image_id'] ?? null),
        ];
    }

    /** @return array<string,mixed>|null */
    private function publishedPage(string $slug): ?array
    {
        return $this->db->one('SELECT * FROM pages WHERE slug=? AND status=?', [$slug, 'published']);
    }

    /** @param array<string,mixed> $page */
    private function pageHasLiveLayout(array $page): bool
    {
        $raw = (string) ($page['layout_json'] ?? '');
        if ($raw === '' || $raw === 'null' || $raw === '{"version":1,"elements":[]}') {
            return false;
        }
        $layout = json_decode($raw, true);
        if (!is_array($layout) || empty($layout['elements'])) {
            return false;
        }
        $meta = is_array($layout['meta'] ?? null) ? $layout['meta'] : [];
        if (!empty($meta['useOnSite'])) {
            return true;
        }
        if (!empty($meta['seed'])) {
            return false;
        }
        $markers = [
            'Оформите обложку раздела',
            'Карточки проектов — по /projects',
            'Добавьте заголовок и при необходимости виджеты',
            'Оформите раздел услуг в конструкторе',
            'Расскажите о себе, опыте и подходе',
            'Опишите, какие данные собирает сайт',
        ];
        foreach ($markers as $m) {
            if (str_contains($raw, $m)) {
                return false;
            }
        }
        return true;
    }

    /**
     * @param array<string,mixed> $page
     * @return array{body:string, description:string}
     */
    private function extractFromPage(array $page): array
    {
        $chunks = [];
        $desc = '';
        $layout = json_decode((string) ($page['layout_json'] ?? ''), true);
        if (is_array($layout)) {
            $this->walkLayout($layout['elements'] ?? [], $chunks, $desc);
        }
        if ($chunks === [] && !empty($page['content'])) {
            $chunks[] = $this->rich((string) $page['content']);
            $desc = $this->plain((string) $page['content'], 160);
        }
        return ['body' => implode("\n", $chunks), 'description' => $desc];
    }

    /** @param list<mixed> $elements @param list<string> $chunks */
    private function walkLayout(array $elements, array &$chunks, string &$desc): void
    {
        foreach ($elements as $el) {
            if (!is_array($el)) {
                continue;
            }
            $type = (string) ($el['widgetType'] ?? $el['type'] ?? '');
            $settings = is_array($el['settings'] ?? null) ? $el['settings'] : [];

            if ($type === 'hero') {
                $headline = trim((string) ($settings['headline'] ?? ''));
                $sub = trim((string) ($settings['subheadline'] ?? ''));
                if ($headline !== '') {
                    $chunks[] = '<h1>' . $this->e($headline) . '</h1>';
                    if ($desc === '') {
                        $desc = $this->plain($sub !== '' ? $sub : $headline, 160);
                    }
                }
                if ($sub !== '') {
                    $chunks[] = '<p>' . $this->e($sub) . '</p>';
                }
                $ctaBits = [];
                foreach (
                    [
                        ['primary_cta_label', 'primary_cta_href'],
                        ['secondary_cta_label', 'secondary_cta_href'],
                    ] as [$lk, $hk]
                ) {
                    $label = trim((string) ($settings[$lk] ?? ''));
                    $href = trim((string) ($settings[$hk] ?? ''));
                    if ($label !== '') {
                        $ctaBits[] = '<a href="' . $this->e($href !== '' ? $href : '#') . '">' . $this->e($label) . '</a>';
                    }
                }
                if ($ctaBits !== []) {
                    $chunks[] = '<p>' . implode(' · ', $ctaBits) . '</p>';
                }
            } elseif ($type === 'heading' && !empty($settings['text'])) {
                $tag = in_array(($settings['tag'] ?? 'h2'), ['h1', 'h2', 'h3', 'h4'], true) ? $settings['tag'] : 'h2';
                // Avoid second H1 if hero already emitted one.
                if ($tag === 'h1' && $this->chunksHaveTag($chunks, 'h1')) {
                    $tag = 'h2';
                }
                $chunks[] = '<' . $tag . '>' . $this->e((string) $settings['text']) . '</' . $tag . '>';
            } elseif ($type === 'text' && !empty($settings['html'])) {
                $html = $this->rich((string) $settings['html']);
                $chunks[] = $html;
                if ($desc === '') {
                    $desc = $this->plain(strip_tags($html), 160);
                }
            } elseif ($type === 'features-grid') {
                $title = trim((string) ($settings['title'] ?? ''));
                $subtitle = trim((string) ($settings['subtitle'] ?? ''));
                if ($title !== '') {
                    $chunks[] = '<h2>' . $this->e($title) . '</h2>';
                }
                if ($subtitle !== '') {
                    $chunks[] = '<p>' . $this->e($subtitle) . '</p>';
                }
                $items = is_array($settings['items'] ?? null) ? $settings['items'] : [];
                if ($items !== []) {
                    $chunks[] = '<ul>';
                    foreach ($items as $item) {
                        if (!is_array($item)) {
                            continue;
                        }
                        $it = trim((string) ($item['title'] ?? ''));
                        $body = trim((string) ($item['body'] ?? $item['text'] ?? ''));
                        if ($it === '' && $body === '') {
                            continue;
                        }
                        $chunks[] = '<li><strong>' . $this->e($it !== '' ? $it : '—') . '</strong>'
                            . ($body !== '' ? ' — ' . $this->e($body) : '')
                            . '</li>';
                    }
                    $chunks[] = '</ul>';
                }
            } elseif ($type === 'cta-banner') {
                $title = trim((string) ($settings['title'] ?? $settings['headline'] ?? ''));
                $text = trim((string) ($settings['text'] ?? $settings['subtitle'] ?? $settings['body'] ?? ''));
                $label = trim((string) ($settings['button_label'] ?? $settings['cta_label'] ?? $settings['label'] ?? ''));
                $href = trim((string) ($settings['button_href'] ?? $settings['cta_href'] ?? $settings['href'] ?? '#'));
                if ($title !== '') {
                    $chunks[] = '<h2>' . $this->e($title) . '</h2>';
                }
                if ($text !== '') {
                    $chunks[] = '<p>' . $this->e($text) . '</p>';
                }
                if ($label !== '') {
                    $chunks[] = '<p><a href="' . $this->e($href !== '' ? $href : '#') . '">' . $this->e($label) . '</a></p>';
                }
            } elseif ($type === 'button' && !empty($settings['label'])) {
                $href = (string) ($settings['href'] ?? '#');
                $chunks[] = '<p><a href="' . $this->e($href) . '">' . $this->e((string) $settings['label']) . '</a></p>';
            } elseif ($type === 'faq') {
                $title = trim((string) ($settings['title'] ?? ''));
                if ($title !== '') {
                    $chunks[] = '<h2>' . $this->e($title) . '</h2>';
                }
                $items = is_array($settings['items'] ?? null) ? $settings['items'] : [];
                foreach ($items as $item) {
                    if (!is_array($item)) {
                        continue;
                    }
                    $q = trim((string) ($item['question'] ?? $item['title'] ?? ''));
                    $a = trim((string) ($item['answer'] ?? $item['body'] ?? ''));
                    if ($q !== '') {
                        $chunks[] = '<h3>' . $this->e($q) . '</h3>';
                    }
                    if ($a !== '') {
                        $chunks[] = '<p>' . $this->e($a) . '</p>';
                    }
                }
            } elseif ($type === 'pricing-table') {
                $title = trim((string) ($settings['title'] ?? ''));
                if ($title !== '') {
                    $chunks[] = '<h2>' . $this->e($title) . '</h2>';
                }
                $plans = is_array($settings['plans'] ?? $settings['items'] ?? null)
                    ? ($settings['plans'] ?? $settings['items'])
                    : [];
                if (is_array($plans) && $plans !== []) {
                    $chunks[] = '<ul>';
                    foreach ($plans as $plan) {
                        if (!is_array($plan)) {
                            continue;
                        }
                        $name = trim((string) ($plan['name'] ?? ''));
                        $price = trim((string) ($plan['price'] ?? ''));
                        if ($name === '' && $price === '') {
                            continue;
                        }
                        $chunks[] = '<li><strong>' . $this->e($name) . '</strong>'
                            . ($price !== '' ? ' — ' . $this->e($price) : '')
                            . '</li>';
                    }
                    $chunks[] = '</ul>';
                }
            } elseif ($type === 'blog-list') {
                $title = trim((string) ($settings['title'] ?? 'Блог'));
                $limit = (int) ($settings['limit'] ?? 8);
                $chunks[] = $this->blogIndexSnippet($limit, $title !== '' ? $title : 'Блог');
            } elseif (in_array($type, ['logos-strip', 'image-gallery', 'video-embed', 'projects-grid'], true)) {
                $title = trim((string) ($settings['title'] ?? ''));
                $subtitle = trim((string) ($settings['subtitle'] ?? ''));
                if ($title !== '') {
                    $chunks[] = '<h2>' . $this->e($title) . '</h2>';
                }
                if ($subtitle !== '') {
                    $chunks[] = '<p>' . $this->e($subtitle) . '</p>';
                }
            }
            // blog-list: handled after walk via blogIndexSnippet() on home

            if (!empty($el['elements']) && is_array($el['elements'])) {
                $this->walkLayout($el['elements'], $chunks, $desc);
            }
        }
    }

    /** @param list<string> $chunks */
    private function chunksHaveTag(array $chunks, string $tag): bool
    {
        $open = '<' . $tag . '>';
        foreach ($chunks as $c) {
            if (str_contains($c, $open)) {
                return true;
            }
        }
        return false;
    }

    private function document(
        string $title,
        string $description,
        string $path,
        string $body,
        int $status = 200,
        ?string $ogImage = null,
    ): string {
        $seo = $this->db->one('SELECT * FROM seo_settings LIMIT 1') ?: [];
        $base = rtrim((string) ($seo['canonical_base_url'] ?? $this->app['url'] ?? $this->app['app_url'] ?? ''), '/');
        $canonical = $base !== '' ? $base . ($path === '/' ? '/' : $path) : '';
        $nav = $this->db->all(
            "SELECT label, href FROM navigation_items WHERE is_visible=1 AND location IN ('header','both') ORDER BY sort_order, id"
        );
        $navHtml = '';
        $seenHref = [];
        foreach ($nav as $item) {
            $href = trim((string) ($item['href'] ?? ''));
            $label = trim((string) ($item['label'] ?? ''));
            if ($href === '' || $label === '') {
                continue;
            }
            $key = strtolower($href);
            if (isset($seenHref[$key])) {
                continue;
            }
            $seenHref[$key] = true;
            $navHtml .= '<a href="' . $this->e($href) . '">' . $this->e($label) . '</a> ';
        }

        $ogTitle = $this->e((string) ($seo['og_title'] ?? $title));
        // Prefer dedicated OG blurb; keep page description for <meta name="description">.
        $metaDesc = $description;
        $ogDescRaw = trim((string) ($seo['og_description'] ?? ''));
        if ($ogDescRaw === '') {
            $ogDescRaw = $description;
        }
        $ogDesc = $this->e($ogDescRaw);
        $titleEsc = $this->e($title);
        $descEsc = $this->e($metaDesc);
        $canonEsc = $this->e($canonical);
        $statusAttr = (string) $status;

        if ($ogImage === null || $ogImage === '') {
            $ogImage = $this->mediaPublicUrl($seo['og_image_id'] ?? null);
            if (($ogImage === null || $ogImage === '') && !empty($seo['og_image_url'])) {
                $ogImage = (string) $seo['og_image_url'];
            }
        }
        $ogImageTag = $ogImage
            ? '<meta property="og:image" content="' . $this->e($ogImage) . '">'
            : '';

        $site = $this->db->one('SELECT * FROM site_settings LIMIT 1') ?: [];
        $jsonLd = $this->seoJsonLdTag($seo, $site, $base, $title, $metaDesc);

        return <<<HTML
<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{$titleEsc}</title>
<meta name="description" content="{$descEsc}">
<meta name="robots" content="index,follow">
<link rel="canonical" href="{$canonEsc}">
<meta property="og:type" content="website">
<meta property="og:title" content="{$ogTitle}">
<meta property="og:description" content="{$ogDesc}">
<meta property="og:url" content="{$canonEsc}">
{$ogImageTag}
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="{$ogTitle}">
<meta name="twitter:description" content="{$ogDesc}">
{$jsonLd}
<style>
body{font-family:system-ui,sans-serif;max-width:720px;margin:2rem auto;padding:0 1rem;line-height:1.55;color:#111}
nav{margin-bottom:1.5rem} nav a{margin-right:.75rem}
a{color:#0b57d0} h1{font-size:1.75rem} h2{font-size:1.25rem;margin-top:1.5rem}
</style>
</head>
<body data-prerender="1" data-prerender-status="{$statusAttr}">
<header><nav>{$navHtml}</nav></header>
<main>
{$body}
</main>
<footer><p><a href="{$canonEsc}">Открыть интерактивную версию сайта</a></p></footer>
</body>
</html>
HTML;
    }

    private function mediaPublicUrl(mixed $mediaId): ?string
    {
        $id = (int) $mediaId;
        if ($id < 1) {
            return null;
        }
        $m = $this->db->one('SELECT id FROM media WHERE id=?', [$id]);
        if (!$m) {
            return null;
        }
        $base = rtrim((string) ($this->app['url'] ?? $this->app['app_url'] ?? ''), '/');
        return $base . '/api/v1/media/' . $id;
    }

    /**
     * @return list<string>
     */
    private function parseTargetRegions(mixed $raw): array
    {
        $allowed = ['CIS', 'EU', 'USA', 'ASIA'];
        if (is_string($raw) && trim($raw) !== '') {
            $decoded = json_decode($raw, true);
            $raw = is_array($decoded) ? $decoded : [];
        }
        if (!is_array($raw)) {
            return [];
        }
        $out = [];
        foreach ($raw as $v) {
            $code = strtoupper(trim((string) $v));
            if (in_array($code, $allowed, true) && !in_array($code, $out, true)) {
                $out[] = $code;
            }
        }
        return $out;
    }

    /**
     * @param list<string> $codes
     * @return list<array<string, string>>
     */
    private function areaServedNodes(array $codes): array
    {
        $map = [
            'CIS' => [
                '@type' => 'AdministrativeArea',
                'name' => 'CIS',
                'alternateName' => 'Commonwealth of Independent States',
            ],
            'EU' => [
                '@type' => 'AdministrativeArea',
                'name' => 'European Union',
                'alternateName' => 'EU',
            ],
            'USA' => [
                '@type' => 'Country',
                'name' => 'United States',
                'alternateName' => 'USA',
            ],
            'ASIA' => [
                '@type' => 'Continent',
                'name' => 'Asia',
            ],
        ];
        $nodes = [];
        foreach ($codes as $code) {
            if (isset($map[$code])) {
                $nodes[] = $map[$code];
            }
        }
        return $nodes;
    }

    /**
     * Organization + WebSite JSON-LD with optional areaServed from seo_settings.target_regions.
     *
     * @param array<string, mixed> $seo
     * @param array<string, mixed> $site
     */
    private function seoJsonLdTag(
        array $seo,
        array $site,
        string $baseUrl,
        string $title,
        string $description,
    ): string {
        $name = trim((string) ($site['site_name'] ?? ''));
        if ($name === '') {
            $name = trim((string) ($seo['site_title'] ?? ''));
        }
        if ($name === '') {
            $name = (string) ($this->app['app_name'] ?? 'Jasefly');
        }
        $url = rtrim($baseUrl, '/');
        if ($url === '') {
            $url = rtrim((string) ($this->app['url'] ?? $this->app['app_url'] ?? ''), '/');
        }
        if ($url === '') {
            return '';
        }

        $areaServed = $this->areaServedNodes($this->parseTargetRegions($seo['target_regions'] ?? null));

        $organization = [
            '@type' => 'Organization',
            '@id' => $url . '/#organization',
            'name' => $name,
            'url' => $url . '/',
        ];
        if ($areaServed !== []) {
            $organization['areaServed'] = $areaServed;
        }

        $website = [
            '@type' => 'WebSite',
            '@id' => $url . '/#website',
            'name' => $name,
            'url' => $url . '/',
            'publisher' => ['@id' => $url . '/#organization'],
        ];
        $pageTitle = trim($title);
        if ($pageTitle !== '') {
            $website['name'] = $pageTitle;
        }
        $pageDesc = trim($description);
        if ($pageDesc !== '') {
            $website['description'] = $pageDesc;
        }
        if ($areaServed !== []) {
            $website['areaServed'] = $areaServed;
        }

        $graph = [
            '@context' => 'https://schema.org',
            '@graph' => [$organization, $website],
        ];
        $json = json_encode($graph, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        if (!is_string($json) || $json === '') {
            return '';
        }

        return '<script type="application/ld+json" data-jasefly-seo="1">' . $json . '</script>';
    }

    private function rich(string $html): string
    {
        $html = trim($html);
        if ($html === '') {
            return '';
        }
        if (class_exists(HtmlSanitizer::class)) {
            return HtmlSanitizer::clean($html);
        }
        return strip_tags($html, '<p><br><a><strong><em><ul><ol><li><h2><h3><h4><blockquote><code><pre><img>');
    }

    private function plain(string $text, int $max): string
    {
        $text = trim(preg_replace('/\s+/u', ' ', strip_tags($text)) ?? '');
        if (mb_strlen($text) <= $max) {
            return $text;
        }
        return rtrim(mb_substr($text, 0, $max - 1)) . '…';
    }

    private function e(string $s): string
    {
        return htmlspecialchars($s, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
    }
}
