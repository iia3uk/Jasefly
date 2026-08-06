<?php
declare(strict_types=1);

namespace App\Services;

use App\Database;

final class SearchService
{
    public function __construct(private Database $db) {}

    public function search(string $query, int $limit = 20): array
    {
        $q = trim($query);
        if ($q === '') {
            return [];
        }
        $like = '%' . $q . '%';
        $results = [];

        $add = function (string $type, string $label, string $href, ?string $subtitle = null, ?int $id = null) use (&$results, $limit): void {
            if (count($results) >= $limit) {
                return;
            }
            $results[] = compact('type', 'label', 'href', 'subtitle', 'id');
        };

        if ($this->pluginOn('projects')) {
            foreach ($this->db->all(
                "SELECT id, title, slug, short_description FROM projects WHERE deleted_at IS NULL AND status='published' AND (title LIKE ? OR short_description LIKE ?) LIMIT 5",
                [$like, $like]
            ) as $row) {
                $add('project', $row['title'], '/admin/projects/' . $row['id'], $row['short_description'], (int) $row['id']);
            }
        }

        if ($this->pluginOn('blog')) {
            foreach ($this->db->all(
                "SELECT id, title, slug, excerpt FROM blog_posts WHERE deleted_at IS NULL AND (title LIKE ? OR excerpt LIKE ?) LIMIT 5",
                [$like, $like]
            ) as $row) {
                $add('blog', $row['title'], '/admin/blog/' . $row['id'], $row['excerpt'], (int) $row['id']);
            }
        }

        foreach ($this->db->all(
            "SELECT id, name FROM skills WHERE deleted_at IS NULL AND name LIKE ? LIMIT 5",
            [$like]
        ) as $row) {
            $add('skill', $row['name'], '/admin/skills', null, (int) $row['id']);
        }

        foreach ($this->db->all(
            "SELECT id, company, role FROM experience WHERE deleted_at IS NULL AND (company LIKE ? OR role LIKE ?) LIMIT 5",
            [$like, $like]
        ) as $row) {
            $add('experience', $row['role'] . ' @ ' . $row['company'], '/admin/experience/' . $row['id'], null, (int) $row['id']);
        }

        foreach ($this->db->all(
            "SELECT id, title FROM services WHERE deleted_at IS NULL AND title LIKE ? LIMIT 5",
            [$like]
        ) as $row) {
            $add('service', $row['title'], '/admin/services/' . $row['id'], null, (int) $row['id']);
        }

        foreach ($this->db->all(
            "SELECT id, title, slug FROM pages WHERE title LIKE ? OR slug LIKE ? LIMIT 5",
            [$like, $like]
        ) as $row) {
            $add('page', $row['title'], '/admin/pages/' . $row['id'] . '/builder', $row['slug'], (int) $row['id']);
        }

        foreach ($this->db->all(
            "SELECT id, original_name, alt_text FROM media WHERE deleted_at IS NULL AND (original_name LIKE ? OR alt_text LIKE ? OR filename LIKE ?) LIMIT 5",
            [$like, $like, $like]
        ) as $row) {
            $add('media', $row['original_name'], '/admin/media', $row['alt_text'], (int) $row['id']);
        }

        return $results;
    }

    /** Default-off when no modules row (same rule as PluginStateService). */
    private function pluginOn(string $name): bool
    {
        if (in_array($name, \App\Services\PluginStateService::CORE, true)) {
            return true;
        }
        try {
            $row = $this->db->one('SELECT is_enabled FROM modules WHERE name = ? LIMIT 1', [$name]);
            if ($row === null) {
                return false;
            }
            return (int) ($row['is_enabled'] ?? 0) === 1;
        } catch (\Throwable) {
            return false;
        }
    }

    /**
     * Public site search — published content only, public URLs.
     *
     * @return list<array{type:string,label:string,href:string,subtitle:?string}>
     */
    public function publicSearch(string $query, int $limit = 12): array
    {
        $q = trim($query);
        if (mb_strlen($q) < 2) {
            return [];
        }
        $like = '%' . $q . '%';
        $results = [];
        $add = function (string $type, string $label, string $href, ?string $subtitle = null) use (&$results, $limit): void {
            if (count($results) >= $limit) {
                return;
            }
            $results[] = [
                'type' => $type,
                'label' => $label,
                'href' => $href,
                'subtitle' => $subtitle,
            ];
        };

        try {
            foreach ($this->db->all(
                "SELECT title, slug, seo_description FROM pages
                 WHERE status='published' AND is_home=0
                   AND slug NOT IN ('__home','not-found','admin-login','register','lazy-loader','maintenance')
                   AND (title LIKE ? OR slug LIKE ? OR seo_title LIKE ? OR seo_description LIKE ?)
                 LIMIT 6",
                [$like, $like, $like, $like]
            ) as $row) {
                $slug = (string) ($row['slug'] ?? '');
                if ($slug === '' || str_starts_with($slug, '__')) {
                    continue;
                }
                $add('page', (string) $row['title'], '/' . ltrim($slug, '/'), $row['seo_description'] ?? null);
            }
        } catch (\Throwable) {
            // pages schema may vary
        }

        if ($this->pluginOn('portfolio') || $this->pluginOn('projects')) {
            try {
                foreach ($this->db->all(
                    "SELECT title, slug, short_description FROM projects
                     WHERE deleted_at IS NULL AND status='published'
                       AND (title LIKE ? OR short_description LIKE ? OR slug LIKE ?)
                     LIMIT 5",
                    [$like, $like, $like]
                ) as $row) {
                    $add('project', (string) $row['title'], '/projects/' . $row['slug'], $row['short_description'] ?? null);
                }
            } catch (\Throwable) {
            }
        }

        if ($this->pluginOn('blog')) {
            try {
                foreach ($this->db->all(
                    "SELECT title, slug, excerpt FROM blog_posts
                     WHERE deleted_at IS NULL AND status='published'
                       AND (title LIKE ? OR excerpt LIKE ? OR slug LIKE ?)
                     LIMIT 5",
                    [$like, $like, $like]
                ) as $row) {
                    $add('blog', (string) $row['title'], '/blog/' . $row['slug'], $row['excerpt'] ?? null);
                }
            } catch (\Throwable) {
            }
        }

        return $results;
    }
}
