<?php
declare(strict_types=1);

namespace App\PackageModules\Indexnow;

use App\Platform\Contracts\PlatformDatabaseInterface;

/**
 * Build public absolute URLs from CMS resources.
 */
final class UrlResolver
{
    public function __construct(
        private PlatformDatabaseInterface $db,
        private string $siteOrigin,
    ) {}

    /** Origin without trailing slash, e.g. https://example.com */
    public function origin(): string
    {
        return rtrim($this->siteOrigin, '/');
    }

    public function host(): string
    {
        $host = parse_url($this->siteOrigin, PHP_URL_HOST);
        return is_string($host) ? $host : '';
    }

    /**
     * @param array<string, mixed> $payload resource.afterSave / afterDelete / page.afterPublish
     * @return list<string>
     */
    public function urlsFromEvent(string $event, array $payload): array
    {
        $resource = (string) ($payload['resource'] ?? $payload['table'] ?? '');
        $data = is_array($payload['data'] ?? null) ? $payload['data'] : [];
        $id = (int) ($payload['id'] ?? $payload['pageId'] ?? 0);

        if ($event === 'page.afterPublish' || $resource === 'pages') {
            $pageId = $id > 0 ? $id : (int) ($payload['pageId'] ?? 0);
            return $this->pageUrls($pageId, $data);
        }

        return match ($resource) {
            'blog', 'blog_posts' => $this->slugUrls('blog_posts', $id, $data, '/blog/'),
            'projects' => $this->slugUrls('projects', $id, $data, '/projects/'),
            'products' => $this->slugUrls('products', $id, $data, '/products/'),
            'services' => $this->slugUrls('services', $id, $data, '/services/'),
            'pages' => $this->pageUrls($id, $data),
            default => [],
        };
    }

    /**
     * Collect published content URLs (capped).
     * @return list<string>
     */
    public function collectPublished(int $limit = 500): array
    {
        $out = [];
        $origin = $this->origin();
        if ($origin === '') {
            return [];
        }

        try {
            $pages = $this->db->all(
                "SELECT slug, is_home FROM pages WHERE status='published' AND deleted_at IS NULL ORDER BY id DESC LIMIT ?",
                [max(1, (int) ($limit / 2))]
            );
            foreach ($pages as $p) {
                if ((int) ($p['is_home'] ?? 0) === 1) {
                    $out[] = $origin . '/';
                } else {
                    $slug = trim((string) ($p['slug'] ?? ''), '/');
                    if ($slug !== '') {
                        $out[] = $origin . '/' . $slug;
                    }
                }
            }
        } catch (\Throwable) {
        }

        foreach (
            [
                ['blog_posts', '/blog/'],
                ['projects', '/projects/'],
                ['products', '/products/'],
                ['services', '/services/'],
            ] as [$table, $prefix]
        ) {
            try {
                $rows = $this->db->all(
                    "SELECT slug FROM {$table} WHERE status='published' AND deleted_at IS NULL ORDER BY id DESC LIMIT 100",
                    []
                );
                foreach ($rows as $r) {
                    $slug = trim((string) ($r['slug'] ?? ''), '/');
                    if ($slug !== '') {
                        $out[] = $origin . $prefix . $slug;
                    }
                }
            } catch (\Throwable) {
            }
        }

        $out = array_values(array_unique($out));
        return array_slice($out, 0, max(1, $limit));
    }

    /**
     * @param array<string, mixed> $data
     * @return list<string>
     */
    private function pageUrls(int $id, array $data): array
    {
        $origin = $this->origin();
        if ($origin === '') {
            return [];
        }
        $slug = (string) ($data['slug'] ?? '');
        $isHome = (int) ($data['is_home'] ?? 0);
        if ($slug === '' && $id > 0) {
            try {
                $row = $this->db->one('SELECT slug, is_home FROM pages WHERE id=?', [$id]);
                if ($row) {
                    $slug = (string) ($row['slug'] ?? '');
                    $isHome = (int) ($row['is_home'] ?? 0);
                }
            } catch (\Throwable) {
            }
        }
        if ($isHome === 1 || $slug === '' || $slug === 'home') {
            return [$origin . '/'];
        }
        return [$origin . '/' . trim($slug, '/')];
    }

    /**
     * @param array<string, mixed> $data
     * @return list<string>
     */
    private function slugUrls(string $table, int $id, array $data, string $prefix): array
    {
        $origin = $this->origin();
        if ($origin === '') {
            return [];
        }
        $slug = (string) ($data['slug'] ?? '');
        if ($slug === '' && $id > 0) {
            try {
                $row = $this->db->one("SELECT slug FROM {$table} WHERE id=?", [$id]);
                $slug = (string) ($row['slug'] ?? '');
            } catch (\Throwable) {
            }
        }
        $slug = trim($slug, '/');
        if ($slug === '') {
            return [];
        }
        return [$origin . $prefix . $slug];
    }
}
