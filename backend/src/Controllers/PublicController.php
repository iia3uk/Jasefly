<?php
declare(strict_types=1);

namespace App\Controllers;

use App\Core\Container;
use App\Core\ModuleRegistry;
use App\Database;
use App\Modules\Mail\ContactFormService;
use App\Request;
use App\Response;
use App\Services\MailService;
use App\Services\MigrationService;
use App\Services\PageScheduleService;
use App\Services\PathRedirectService;
use App\Services\SitemapService;
use App\Services\SlugService;
use App\Services\SoftDeleteService;
use App\Jwt;
use App\Support\AuthCookie;
use App\Support\AdminBasePath;
use App\Utils\Validator;
use Throwable;

final class PublicController
{
    private SoftDeleteService $softDelete;
    private SlugService $slugs;

    public function __construct(private Database $db, private array $app)
    {
        $this->softDelete = new SoftDeleteService($db);
        $this->slugs = new SlugService($db);
    }

    public function health(Request $r): never
    {
        Response::json(['status' => 'ok', 'time' => gmdate(DATE_ATOM)]);
    }

    public function site(Request $r): never
    {
        // Apply pending SQL on first public hit after deploy (safe if already up to date).
        $this->tryAutoMigrate();

        $enabled = $this->enabledPluginNames();
        $portfolioOn = in_array('portfolio', $enabled, true);
        $translateOn = in_array('translate', $enabled, true);

        $one = fn(string $t) => $this->db->one("SELECT * FROM `$t` LIMIT 1");
        $nav = $this->db->all(
            "SELECT * FROM navigation_items WHERE is_visible=1 AND location IN ('header','both') ORDER BY sort_order, id"
        );
        $footerNav = $this->db->all(
            "SELECT * FROM navigation_items WHERE is_visible=1 AND location IN ('footer','both') ORDER BY sort_order, id"
        );

        Response::json([
            'data' => [
                'site_settings' => $one('site_settings'),
                'theme' => $one('theme_settings'),
                'seo' => $this->normalizeSeo($one('seo_settings') ?: []),
                'navigation' => $this->filterNavByPlugins($nav, $enabled),
                'footer_nav' => $this->filterNavByPlugins($footerNav, $enabled),
                'footer' => $one('footer_settings'),
                'social' => $portfolioOn
                    ? $this->db->all('SELECT * FROM social_links WHERE is_visible=1 ORDER BY sort_order, id')
                    : [],
                'hero' => $portfolioOn
                    ? $this->hydrateMedia($one('hero_settings') ?: [], ['background_media_id'])
                    : null,
                'homepage_sections' => $portfolioOn
                    ? $this->db->all(
                        'SELECT * FROM homepage_sections WHERE is_visible=1 ORDER BY sort_order, id'
                    )
                    : [],
                'home_page' => $this->normalizePage($this->homePageRow()),
                // Шаблон экрана lazy-load (Suspense) — сразу в site, без лишнего запроса.
                'lazy_loader_page' => $this->normalizePage($this->systemPageRow('lazy-loader')),
                // Настройки плагина Portfolio (null, если плагин выключен).
                'portfolio' => $portfolioOn ? $this->portfolioPluginSettings() : null,
                'translate' => $translateOn ? $this->translatePluginSettings() : null,
                'enabled_plugins' => $enabled,
            ],
        ]);
    }

    public function profile(Request $r): never
    {
        if (!$this->pluginEnabled('portfolio')) {
            Response::json(['data' => null]);
        }
        $profile = $this->db->one('SELECT * FROM profile LIMIT 1');
        if ($profile) {
            $profile = $this->hydrateMedia($profile, ['photo_media_id', 'avatar_media_id', 'resume_media_id']);
        }
        Response::json(['data' => $profile]);
    }

    public function statistics(Request $r): never
    {
        if (!$this->pluginEnabled('portfolio')) {
            Response::json(['data' => []]);
        }
        Response::json(['data' => $this->db->all('SELECT * FROM statistics WHERE is_visible=1 ORDER BY sort_order, id')]);
    }

    public function experience(Request $r): never
    {
        if (!$this->pluginEnabled('portfolio')) {
            Response::json(['data' => []]);
        }
        $where = $this->softDelete->notDeletedClause('experience');
        $rows = $this->db->all("SELECT * FROM experience WHERE is_visible=1 AND $where ORDER BY sort_order, start_date DESC");
        foreach ($rows as &$row) {
            $row['technologies'] = $this->decodeJson($row['technologies'] ?? null);
        }
        Response::json(['data' => $rows]);
    }

    public function education(Request $r): never
    {
        if (!$this->pluginEnabled('portfolio')) {
            Response::json(['data' => []]);
        }
        Response::json(['data' => $this->db->all('SELECT * FROM education WHERE is_visible=1 ORDER BY sort_order, id')]);
    }

    public function skills(Request $r): never
    {
        if (!$this->pluginEnabled('portfolio')) {
            Response::json(['data' => []]);
        }
        $catWhere = $this->softDelete->notDeletedClause('skill_categories');
        $skillWhere = $this->softDelete->notDeletedClause('skills');
        $categories = $this->db->all("SELECT * FROM skill_categories WHERE is_visible=1 AND $catWhere ORDER BY sort_order, id");
        foreach ($categories as &$category) {
            $category['skills'] = $this->db->all(
                "SELECT * FROM skills WHERE category_id=? AND is_visible=1 AND $skillWhere ORDER BY sort_order, id",
                [$category['id']]
            );
        }
        Response::json(['data' => $categories]);
    }

    public function projects(Request $r, ?string $slug = null): never
    {
        // Public project pages are owned by the portfolio product surface.
        if (!$this->pluginEnabled('portfolio')) {
            if ($slug !== null) {
                Response::error('Not found', 404);
            }
            Response::json(['data' => []]);
        }
        $notDeleted = $this->softDelete->notDeletedClause('projects');
        if ($slug !== null) {
            $project = $this->db->one("SELECT * FROM projects WHERE slug=? AND status=? AND $notDeleted", [$slug, 'published']);
            if (!$project) {
                $redirect = $this->slugs->resolve('project', $slug);
                if ($redirect) {
                    $this->slugs->redirectOr404('project', $slug, '/projects');
                }
                Response::error('Not found', 404);
            }
            Response::json(['data' => $this->enrichProject($project)]);
        }

        $featured = $r->query('featured');
        $sql = "SELECT * FROM projects WHERE status=? AND $notDeleted";
        $params = ['published'];
        if ($featured === '1') {
            $sql .= ' AND is_featured=1';
        }
        $sql .= ' ORDER BY sort_order, published_at DESC, id DESC';
        $rows = $this->db->all($sql, $params);
        foreach ($rows as &$row) {
            $row = $this->enrichProject($row, false);
        }
        Response::json(['data' => $rows]);
    }

    public function blog(Request $r, ?string $slug = null): never
    {
        if (!$this->pluginEnabled('blog')) {
            if ($slug !== null) {
                Response::error('Not found', 404);
            }
            Response::json(['data' => []]);
        }
        $notDeleted = $this->softDelete->notDeletedClause('blog_posts');
        if ($slug !== null) {
            $post = $this->db->one("SELECT * FROM blog_posts WHERE slug=? AND status=? AND $notDeleted", [$slug, 'published']);
            if (!$post) {
                $redirect = $this->slugs->resolve('blog_post', $slug);
                if ($redirect) {
                    $this->slugs->redirectOr404('blog_post', $slug, '/blog');
                }
                Response::error('Not found', 404);
            }
            $post = $this->enrichPost($post);
            $post['related'] = $this->relatedPosts((int) $post['id'], $post['category_id'] ?? null);
            Response::json(['data' => $post]);
        }

        $rows = $this->db->all(
            "SELECT * FROM blog_posts WHERE status=? AND $notDeleted ORDER BY published_at DESC, id DESC",
            ['published']
        );
        foreach ($rows as &$row) {
            $row = $this->enrichPost($row, false);
        }
        Response::json(['data' => $rows]);
    }

    public function services(Request $r): never
    {
        if (!$this->pluginEnabled('portfolio')) {
            Response::json(['data' => []]);
        }
        $where = $this->softDelete->notDeletedClause('services');
        $rows = $this->db->all("SELECT * FROM services WHERE is_visible=1 AND $where ORDER BY sort_order, id");
        foreach ($rows as &$row) {
            $row['features'] = $this->decodeJson($row['features'] ?? null);
        }
        Response::json(['data' => $rows]);
    }

    public function testimonials(Request $r): never
    {
        if (!$this->pluginEnabled('portfolio')) {
            Response::json(['data' => []]);
        }
        $where = $this->softDelete->notDeletedClause('testimonials');
        Response::json(['data' => $this->db->all("SELECT * FROM testimonials WHERE is_visible=1 AND $where ORDER BY sort_order, id")]);
    }

    public function contactInfo(Request $r): never
    {
        // contact_info — системный singleton (форма/страница Контакты), не Portfolio.
        Response::json(['data' => $this->db->one('SELECT * FROM contact_info LIMIT 1')]);
    }

    public function page(Request $r, string $slug): never
    {
        // Только data-разделы Portfolio/Blog, не маркетинговые CMS-страницы about/contact.
        $pluginSlugs = [
            'projects' => 'portfolio',
            'services' => 'portfolio',
            'blog' => 'blog',
        ];
        $needed = $pluginSlugs[$slug] ?? null;
        if ($needed !== null && !$this->pluginEnabled($needed)) {
            Response::error('Not found', 404);
        }

        // Manual path redirects first (e.g. /old-slug → /new)
        (new PathRedirectService($this->db))->redirectOrPass('/' . ltrim($slug, '/'));

        // Lazy scheduled publish (no cron)
        $page = (new PageScheduleService($this->db))->publishedAfterPromote($slug);
        if (!$page) {
            $page = $this->db->one('SELECT * FROM pages WHERE slug=? AND status=?', [$slug, 'published']);
        }
        // Staff (JWT / auth cookie) may open drafts on the real public URL for production QA.
        if (!$page && $this->staffCanPreviewDrafts($r)) {
            $page = $this->db->one('SELECT * FROM pages WHERE slug=? AND status=?', [$slug, 'draft']);
        }
        if (!$page) {
            $redirect = $this->slugs->resolve('page', $slug);
            if ($redirect) {
                header('Location: /' . ltrim($redirect['new_slug'], '/'), true, 301);
                Response::json([
                    'success' => true,
                    'data' => ['redirect' => '/' . $redirect['new_slug'], 'status' => 301],
                ], 301);
            }
            Response::error('Not found', 404);
        }
        $data = $this->normalizePage($page);
        if (($page['status'] ?? '') === 'draft') {
            $data['preview'] = true;
        }
        Response::json(['data' => $data]);
    }

    /** True when request carries a valid staff access token (Bearer or HttpOnly cookie). */
    private function staffCanPreviewDrafts(Request $r): bool
    {
        $token = $r->bearer() ?: AuthCookie::token();
        if (!$token) {
            return false;
        }
        try {
            $payload = Jwt::decode($token, (string) ($this->app['jwt_secret'] ?? ''));
            if (($payload['type'] ?? '') !== 'access') {
                return false;
            }
            $role = (string) ($payload['role'] ?? '');
            return $role === '' || in_array($role, ['admin', 'editor', 'super_admin'], true)
                || isset($payload['sub']);
        } catch (Throwable) {
            return false;
        }
    }

    private function normalizePage(?array $page): ?array
    {
        if (!$page) {
            return null;
        }
        $page['layout'] = $this->decodeJson($page['layout_json'] ?? null);
        $page['is_home'] = (int) ($page['is_home'] ?? 0) === 1;
        $page = $this->hydrateMedia($page, ['og_image_id']);
        return $page;
    }

    /** Home document for page builder; null if schema not migrated yet. */
    private function homePageRow(): ?array
    {
        try {
            (new PageScheduleService($this->db))->promoteDue();
            return $this->db->one('SELECT * FROM pages WHERE is_home=1 AND status=? LIMIT 1', ['published']);
        } catch (Throwable) {
            return null;
        }
    }

    /** Published system page by slug (lazy-loader, admin-login, …). */
    private function systemPageRow(string $slug): ?array
    {
        try {
            return $this->db->one('SELECT * FROM pages WHERE slug=? AND status=? LIMIT 1', [$slug, 'published']);
        } catch (Throwable) {
            return null;
        }
    }

    private function tryAutoMigrate(): void
    {
        try {
            $root = dirname(__DIR__, 2);
            $svc = new MigrationService(
                $this->db,
                $root . '/migrations',
                (string) ($this->app['storage'] ?? $root . '/storage')
            );
            $svc->status(true);
        } catch (Throwable) {
            // Site must stay up; admin MigrationBanner shows the debug table.
        }
    }

    public function contact(Request $r): never
    {
        // Плагин Mail (если включён): CSRF + honeypot + captcha + rate limit + SMTP Mailer.
        if (class_exists(ContactFormService::class) && $this->mailPluginEnabled()) {
            $settings = $this->mailPluginSettings();
            $storage = (string) ($this->app['storage'] ?? dirname(__DIR__, 2) . '/storage');
            $result = (new ContactFormService($this->db, $settings, $storage))->handle($r);
            $http = (int) ($result['http'] ?? ($result['ok'] ? 201 : 400));
            if ($result['ok']) {
                Response::json(['message' => $result['message']], $http);
            }
            Response::error($result['message'], $http, $result['errors'] ?? []);
        }

        // Legacy fallback, если модуль Mail недоступен
        if ($r->input('website') || $r->input('company_url')) {
            Response::json(['message' => 'Thanks']);
        }

        $data = $r->all();
        $errors = Validator::check($data, [
            'name' => 'required|max:120',
            'email' => 'required|email|max:255',
            'message' => 'required|max:5000',
        ]);
        if ($errors) {
            Response::error('Validation failed', 422, $errors);
        }

        $this->db->run(
            'INSERT INTO contact_messages(name,email,subject,message,ip_address,user_agent) VALUES(?,?,?,?,?,?)',
            [
                $data['name'],
                $data['email'],
                $data['subject'] ?? '',
                $data['message'],
                $r->ip(),
                substr((string) ($r->header('User-Agent') ?? ''), 0, 500),
            ]
        );

        try {
            (new MailService($this->db, $this->app))->contact($data);
        } catch (\Throwable) {
            // Persist message even if mail transport fails.
        }

        $info = $this->db->one('SELECT form_success_message FROM contact_info LIMIT 1');
        Response::json([
            'message' => $info['form_success_message'] ?? 'Message received',
        ], 201);
    }

    /** @return array{widget_enabled: bool, auto_warmup: bool, source_lang: string, languages: list<string>, position: string, provider: string}|null */
    private function translatePluginSettings(): ?array
    {
        if (!$this->pluginEnabled('translate')) {
            return null;
        }
        try {
            /** @var ModuleRegistry $reg */
            $reg = Container::getInstance()->get(ModuleRegistry::class);
            $module = $reg->get('translate');
            if ($module instanceof \App\Modules\Translate\TranslateModule) {
                return $module->publicConfig();
            }
        } catch (Throwable) {
        }
        return [
            'widget_enabled' => true,
            'auto_warmup' => true,
            'source_lang' => 'ru',
            'languages' => ['en', 'de', 'fr', 'es'],
            'position' => 'bottom-right',
            'provider' => 'mymemory',
        ];
    }

    /** @return array{homepage_template: string, show_blog: bool, show_services: bool, show_testimonials: bool}|null */
    private function portfolioPluginSettings(): ?array
    {
        if (!$this->pluginEnabled('portfolio')) {
            return null;
        }
        $defaults = [
            'homepage_template' => 'classic',
            'show_blog' => true,
            'show_services' => true,
            'show_testimonials' => true,
        ];
        try {
            /** @var ModuleRegistry $reg */
            $reg = Container::getInstance()->get(ModuleRegistry::class);
            $module = $reg->get('portfolio');
            if (!$module) {
                return $defaults;
            }
            $s = $reg->state()->getSettings($module);
            $tpl = (string) ($s['homepage_template'] ?? 'classic');
            if (!in_array($tpl, ['classic', 'builder'], true)) {
                $tpl = 'classic';
            }
            return [
                'homepage_template' => $tpl,
                'show_blog' => (bool) ($s['show_blog'] ?? true),
                'show_services' => (bool) ($s['show_services'] ?? true),
                'show_testimonials' => (bool) ($s['show_testimonials'] ?? true),
            ];
        } catch (Throwable) {
        }
        return $defaults;
    }

    private function pluginEnabled(string $name): bool
    {
        try {
            /** @var ModuleRegistry $reg */
            $reg = Container::getInstance()->get(ModuleRegistry::class);
            $module = $reg->get($name);
            if (!$module) {
                return false;
            }
            return $reg->state()->isEnabled($module);
        } catch (Throwable) {
            return false;
        }
    }

    /** @return list<string> */
    private function enabledPluginNames(): array
    {
        try {
            /** @var ModuleRegistry $reg */
            $reg = Container::getInstance()->get(ModuleRegistry::class);
            $names = [];
            foreach ($reg->all() as $module) {
                $names[] = $module->name();
            }
            return $names;
        } catch (Throwable) {
            return [];
        }
    }

    /**
     * Drop nav items that point at surfaces owned by a disabled plugin.
     *
     * @param list<array<string, mixed>> $items
     * @param list<string> $enabled
     * @return list<array<string, mixed>>
     */
    private function filterNavByPlugins(array $items, array $enabled): array
    {
        // about/contact — CMS-страницы билдера, не зависят от Portfolio.
        $gates = [
            '/services' => 'portfolio',
            '/projects' => 'portfolio',
            '/blog' => 'blog',
            '/products' => 'products',
            '/register' => 'registration',
            '/checkout' => 'payments',
            '/pay' => 'payments',
            '/lab' => 'lab',
        ];
        $enabledSet = array_fill_keys($enabled, true);
        $out = [];
        foreach ($items as $item) {
            $href = (string) ($item['href'] ?? '');
            $path = $href;
            if (preg_match('#^https?://#i', $href)) {
                $path = (string) (parse_url($href, PHP_URL_PATH) ?: '/');
            }
            $path = '/' . trim($path, '/');
            if ($path === '/') {
                $path = '/';
            }
            $blocked = false;
            foreach ($gates as $prefix => $plugin) {
                if ($path === $prefix || str_starts_with($path, $prefix . '/')) {
                    if (!isset($enabledSet[$plugin])) {
                        $blocked = true;
                    }
                    break;
                }
            }
            if (!$blocked) {
                $out[] = $item;
            }
        }
        return $out;
    }

    private function mailPluginEnabled(): bool
    {
        return $this->pluginEnabled('mail');
    }

    /** @return array<string, mixed> */
    private function mailPluginSettings(): array
    {
        try {
            /** @var ModuleRegistry $reg */
            $reg = Container::getInstance()->get(ModuleRegistry::class);
            foreach ($reg->all() as $module) {
                if ($module->name() === 'mail') {
                    return $reg->state()->getSettings($module);
                }
            }
        } catch (Throwable) {
        }
        // Подмешиваем старую таблицу email_settings, если плагин ещё не настроен
        $row = $this->db->one('SELECT * FROM email_settings LIMIT 1') ?: [];
        return [
            'from_name' => $row['from_name'] ?? 'Jasefly CMS',
            'from_email' => $row['from_email'] ?? '',
            'to_email' => $row['to_email'] ?? '',
            'smtp_host' => $row['smtp_host'] ?? '',
            'smtp_port' => (int) ($row['smtp_port'] ?? 587),
            'smtp_encryption' => $row['smtp_encryption'] ?? 'tls',
            'smtp_username' => $row['smtp_username'] ?? '',
            'smtp_password' => $row['smtp_password'] ?? '',
            'captcha_provider' => 'none',
            'success_message' => '',
        ];
    }

    public function sitemap(Request $r): never
    {
        (new SitemapService($this->db, $this->app))->output();
    }

    public function robots(Request $r): never
    {
        $seo = $this->db->one('SELECT robots_txt, canonical_base_url FROM seo_settings LIMIT 1');
        $body = $seo['robots_txt'] ?? null;
        if (!$body) {
            $base = rtrim((string) ($seo['canonical_base_url'] ?? $this->app['url']), '/');
            $site = $this->db->one('SELECT * FROM site_settings LIMIT 1') ?: [];
            $adminBase = AdminBasePath::fromSiteSettings($site);
            // Always disallow classic /admin plus the custom SPA base (never leak via Allow).
            $disallow = ["Disallow: /admin", "Disallow: /api/"];
            if ($adminBase !== 'admin') {
                $disallow[] = "Disallow: /{$adminBase}";
            }
            $body = "User-agent: *\nAllow: /\n" . implode("\n", $disallow) . "\nSitemap: {$base}/sitemap.xml\n";
        }
        header('Content-Type: text/plain; charset=utf-8');
        echo $body;
        exit;
    }

    private function enrichProject(array $project, bool $full = true): array
    {
        $project = $this->hydrateMedia($project, ['cover_media_id', 'og_image_id']);
        $id = (int) $project['id'];
        $project['technologies'] = $this->db->all(
            'SELECT * FROM project_technologies WHERE project_id=? ORDER BY sort_order, id',
            [$id]
        );
        $project['tags'] = $this->db->all(
            'SELECT t.* FROM project_tags t INNER JOIN project_tag_pivot p ON p.tag_id=t.id WHERE p.project_id=? ORDER BY t.name',
            [$id]
        );
        if ($full) {
            $mediaNotDeleted = $this->softDelete->notDeletedClause('media', 'm');
            $project['media'] = $this->db->all(
                "SELECT pm.id AS project_media_id, pm.project_id, pm.media_id, pm.caption, pm.url, pm.media_type, pm.sort_order,
                        m.id, m.path, m.thumbnail_path, m.webp_path, m.mime_type, m.alt_text, m.original_name
                 FROM project_media pm
                 LEFT JOIN media m ON m.id = pm.media_id AND {$mediaNotDeleted}
                 WHERE pm.project_id = ?
                   AND (pm.media_id IS NULL OR m.id IS NOT NULL OR (pm.url IS NOT NULL AND pm.url != ''))
                 ORDER BY pm.sort_order, pm.id",
                [$id]
            );
            $project['features'] = $this->db->all(
                'SELECT * FROM project_features WHERE project_id=? ORDER BY sort_order, id',
                [$id]
            );
            $project['timeline'] = $this->db->all(
                'SELECT * FROM project_timeline WHERE project_id=? ORDER BY sort_order, id',
                [$id]
            );
            if (!empty($project['category_id'])) {
                $project['category'] = $this->db->one('SELECT * FROM project_categories WHERE id=?', [$project['category_id']]);
            }
            $project['related_posts'] = $this->postsForProject($id);
        }
        return $project;
    }

    private function enrichPost(array $post, bool $full = true): array
    {
        $post = $this->hydrateMedia($post, ['cover_media_id', 'og_image_id']);
        $post['toc_json'] = $this->decodeJson($post['toc_json'] ?? null);
        $post['tags'] = $this->db->all(
            'SELECT t.* FROM blog_tags t INNER JOIN blog_post_tags p ON p.tag_id=t.id WHERE p.post_id=? ORDER BY t.name',
            [$post['id']]
        );
        if (!empty($post['category_id'])) {
            $post['category'] = $this->db->one('SELECT * FROM blog_categories WHERE id=?', [$post['category_id']]);
        }
        if (!empty($post['project_id'])) {
            $projAlive = $this->softDelete->notDeletedClause('projects');
            $linked = $this->db->one(
                "SELECT id, title, slug FROM projects WHERE id=? AND status=? AND {$projAlive}",
                [(int) $post['project_id'], 'published']
            );
            $post['project'] = $linked ?: null;
        } else {
            $post['project'] = null;
        }
        if ($full && empty($post['reading_time']) && !empty($post['content'])) {
            $words = str_word_count(strip_tags((string) $post['content']));
            $post['reading_time'] = max(1, (int) ceil($words / 200));
        }
        return $post;
    }

    /** Published blog posts linked to a project (admin project_id). */
    private function postsForProject(int $projectId): array
    {
        $notDeleted = $this->softDelete->notDeletedClause('blog_posts');
        $rows = $this->db->all(
            "SELECT id, title, slug, excerpt, cover_media_id, published_at, reading_time
             FROM blog_posts
             WHERE status=? AND project_id=? AND {$notDeleted}
             ORDER BY published_at DESC, id DESC
             LIMIT 6",
            ['published', $projectId]
        );
        foreach ($rows as &$row) {
            $row = $this->hydrateMedia($row, ['cover_media_id']);
        }
        return $rows;
    }

    private function relatedPosts(int $id, ?int $categoryId): array
    {
        if (!$categoryId) {
            return [];
        }
        $rows = $this->db->all(
            'SELECT id, title, slug, excerpt, cover_media_id, published_at, reading_time
             FROM blog_posts WHERE status=? AND category_id=? AND id<>? ORDER BY published_at DESC LIMIT 3',
            ['published', $categoryId, $id]
        );
        foreach ($rows as &$row) {
            $row = $this->hydrateMedia($row, ['cover_media_id']);
        }
        return $rows;
    }

    private function hydrateMedia(array $row, array $keys): array
    {
        $mediaAlive = $this->softDelete->notDeletedClause('media');
        foreach ($keys as $key) {
            // cover_media_id → cover, photo_media_id → photo; og_image_id → og_image
            if (str_ends_with($key, '_media_id')) {
                $mediaKey = substr($key, 0, -strlen('_media_id'));
            } elseif (str_ends_with($key, '_id')) {
                $mediaKey = substr($key, 0, -3);
            } else {
                $mediaKey = $key;
            }
            $id = $row[$key] ?? null;
            if ($id !== null && $id !== '' && (int) $id > 0) {
                $row[$mediaKey] = $this->db->one(
                    "SELECT id, path, thumbnail_path, webp_path, alt_text, mime_type FROM media WHERE id=? AND {$mediaAlive}",
                    [(int) $id]
                );
            } else {
                $row[$mediaKey] = null;
            }
        }
        return $row;
    }

    /**
     * @param array<string, mixed> $seo
     * @return array<string, mixed>
     */
    private function normalizeSeo(array $seo): array
    {
        if ($seo === []) {
            return $seo;
        }
        $regions = $this->decodeJson($seo['target_regions'] ?? null);
        if (!is_array($regions)) {
            $regions = [];
        }
        $allowed = ['CIS', 'EU', 'USA', 'ASIA'];
        $clean = [];
        foreach ($regions as $v) {
            $code = strtoupper(trim((string) $v));
            if (in_array($code, $allowed, true) && !in_array($code, $clean, true)) {
                $clean[] = $code;
            }
        }
        $seo['target_regions'] = $clean;
        return $seo;
    }

    private function decodeJson(mixed $value): mixed
    {
        if ($value === null || $value === '') {
            return null;
        }
        if (is_array($value)) {
            return $value;
        }
        $decoded = json_decode((string) $value, true);
        return json_last_error() === JSON_ERROR_NONE ? $decoded : $value;
    }
}
