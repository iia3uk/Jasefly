<?php
declare(strict_types=1);

namespace App\Services;

use App\Database;
use App\Platform\Surfaces\PackageSurfaceRegistry;
use App\Platform\Surfaces\SurfaceSql;
use Throwable;

final class SitemapService
{
    public function __construct(private Database $db, private array $app) {}

    public function output(): never
    {
        (new PageScheduleService($this->db))->promoteDue();

        $seo = $this->db->one('SELECT canonical_base_url FROM seo_settings LIMIT 1');
        $base = rtrim((string) ($seo['canonical_base_url'] ?? $this->app['url']), '/');

        $urls = [
            ['loc' => $base . '/', 'priority' => '1.0'],
            ['loc' => $base . '/privacy', 'priority' => '0.3'],
        ];

        // System / template slugs — never index (align with robots.txt Disallow)
        $excludeSlugs = [
            '__home', 'privacy', 'not-found', 'admin-login', 'register', 'lazy-loader', 'maintenance',
            'payment', 'payment-success', 'payment-fail',
            'product-card', 'product-detail', 'product-detail-simple', 'product-detail-storefront',
            'product-detail-marketplace', 'product-detail-digital', 'product-detail-landing',
            // Package index templates — listing URLs come from package sitemap surfaces
            'projects', 'services', 'blog',
        ];
        $excludeList = "'" . implode("','", array_map(
            static fn (string $s): string => str_replace("'", "''", $s),
            $excludeSlugs
        )) . "'";

        try {
            foreach ($this->db->all(
                "SELECT slug, updated_at, published_at FROM pages
                 WHERE status='published' AND is_home=0
                   AND slug NOT IN ({$excludeList})"
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

        foreach (PackageSurfaceRegistry::sitemapEntries() as $entry) {
            foreach ($this->urlsFromSurface($base, $entry) as $u) {
                $urls[] = $u;
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
            echo '<priority>' . ($u['priority'] ?? '0.5') . '</priority>';
            echo '</url>';
        }
        echo '</urlset>';
        exit;
    }

    /**
     * @param array<string, mixed> $entry
     * @return list<array{loc:string,lastmod?:string|null,priority:string}>
     */
    private function urlsFromSurface(string $base, array $entry): array
    {
        $out = [];
        $table = SurfaceSql::ident((string) ($entry['table'] ?? ''));
        if ($table === null) {
            return $out;
        }

        $indexPaths = $entry['index_paths'] ?? [];
        if (is_array($indexPaths)) {
            foreach ($indexPaths as $ip) {
                $path = '/' . ltrim((string) $ip, '/');
                $out[] = [
                    'loc' => $base . $path,
                    'priority' => (string) ($entry['index_priority'] ?? $entry['priority'] ?? '0.8'),
                ];
            }
        }

        $slugCol = SurfaceSql::ident((string) ($entry['slug_column'] ?? 'slug')) ?? 'slug';
        $where = is_array($entry['where'] ?? null) ? $entry['where'] : [];
        [$whereSql, $params] = SurfaceSql::equalityWhere($where);
        $soft = SurfaceSql::softDeleteClause($entry);
        $priority = (string) ($entry['priority'] ?? '0.6');
        $prefix = rtrim((string) ($entry['path_prefix'] ?? ''), '/');

        try {
            $sql = "SELECT `{$slugCol}` AS slug, updated_at"
                . (isset($entry['where']['status']) || true ? ', published_at' : '')
                . " FROM `{$table}` WHERE {$whereSql} AND {$soft}";
            // published_at may be absent — fall back
            try {
                $rows = $this->db->all($sql, $params);
            } catch (Throwable) {
                $sql = "SELECT `{$slugCol}` AS slug, updated_at FROM `{$table}` WHERE {$whereSql} AND {$soft}";
                $rows = $this->db->all($sql, $params);
            }
            foreach ($rows as $p) {
                $slug = (string) ($p['slug'] ?? '');
                if ($slug === '') {
                    continue;
                }
                $out[] = [
                    'loc' => $base . $prefix . '/' . ltrim($slug, '/'),
                    'lastmod' => substr((string) ($p['updated_at'] ?? $p['published_at'] ?? ''), 0, 10) ?: null,
                    'priority' => $priority,
                ];
            }
        } catch (Throwable) {
            // table may be absent if package never migrated
        }

        return $out;
    }
}
