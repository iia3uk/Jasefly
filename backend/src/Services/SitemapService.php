<?php
declare(strict_types=1);

namespace App\Services;

use App\Core\Container;
use App\Core\ModuleRegistry;
use App\Database;
use Throwable;

final class SitemapService
{
    public function __construct(private Database $db, private array $app) {}

    public function output(): never
    {
        (new PageScheduleService($this->db))->promoteDue();

        $seo = $this->db->one('SELECT canonical_base_url FROM seo_settings LIMIT 1');
        $base = rtrim((string) ($seo['canonical_base_url'] ?? $this->app['url']), '/');
        $portfolioOn = $this->pluginEnabled('portfolio');
        $productsOn = $this->pluginEnabled('products');

        $urls = [
            ['loc' => $base . '/', 'priority' => '1.0'],
            ['loc' => $base . '/privacy', 'priority' => '0.3'],
        ];

        // Custom CMS pages (non-system)
        try {
            foreach ($this->db->all(
                "SELECT slug, updated_at, published_at FROM pages
                 WHERE status='published' AND is_home=0
                   AND slug NOT IN ('__home','privacy','not-found','admin-login','register','lazy-loader','maintenance')"
            ) as $p) {
                $slug = (string) ($p['slug'] ?? '');
                if ($slug === '' || str_starts_with($slug, '__')) {
                    continue;
                }
                $urls[] = [
                    'loc' => $base . '/' . ltrim($slug, '/'),
                    'lastmod' => substr((string) ($p['updated_at'] ?? $p['published_at']), 0, 10),
                    'priority' => '0.5',
                ];
            }
        } catch (Throwable) {
            // pages table may lack columns on old installs
        }

        if ($portfolioOn) {
            $urls[] = ['loc' => $base . '/about', 'priority' => '0.8'];
            $urls[] = ['loc' => $base . '/projects', 'priority' => '0.9'];
            $urls[] = ['loc' => $base . '/services', 'priority' => '0.8'];
            $urls[] = ['loc' => $base . '/blog', 'priority' => '0.8'];
            $urls[] = ['loc' => $base . '/contact', 'priority' => '0.7'];

            foreach ($this->db->all("SELECT slug, updated_at, published_at FROM projects WHERE status='published'") as $p) {
                $urls[] = [
                    'loc' => $base . '/projects/' . $p['slug'],
                    'lastmod' => substr((string) ($p['updated_at'] ?? $p['published_at']), 0, 10),
                    'priority' => '0.7',
                ];
            }
            foreach ($this->db->all("SELECT slug, updated_at, published_at FROM blog_posts WHERE status='published'") as $p) {
                $urls[] = [
                    'loc' => $base . '/blog/' . $p['slug'],
                    'lastmod' => substr((string) ($p['updated_at'] ?? $p['published_at']), 0, 10),
                    'priority' => '0.6',
                ];
            }
        }

        if ($productsOn) {
            try {
                foreach ($this->db->all(
                    "SELECT slug, updated_at FROM products WHERE is_visible=1 AND deleted_at IS NULL"
                ) as $p) {
                    if (empty($p['slug'])) {
                        continue;
                    }
                    $urls[] = [
                        'loc' => $base . '/products/' . $p['slug'],
                        'lastmod' => substr((string) ($p['updated_at'] ?? ''), 0, 10) ?: null,
                        'priority' => '0.6',
                    ];
                }
            } catch (Throwable) {
                // products table may be absent if plugin never migrated
            }
        }

        header('Content-Type: application/xml; charset=utf-8');
        echo '<?xml version="1.0" encoding="UTF-8"?>';
        echo '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">';
        foreach ($urls as $u) {
            echo '<url>';
            echo '<loc>' . htmlspecialchars($u['loc'], ENT_XML1) . '</loc>';
            if (!empty($u['lastmod'])) {
                echo '<lastmod>' . htmlspecialchars((string) $u['lastmod'], ENT_XML1) . '</lastmod>';
            }
            echo '<priority>' . $u['priority'] . '</priority>';
            echo '</url>';
        }
        echo '</urlset>';
        exit;
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
}
