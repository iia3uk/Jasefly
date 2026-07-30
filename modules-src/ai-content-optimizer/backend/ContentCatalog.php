<?php
declare(strict_types=1);

namespace App\PackageModules\AiContentOptimizer;

use App\Platform\Contracts\PlatformDatabaseInterface;

/**
 * Maps Jasefly content types → table/column adapters for SEO rewrite.
 */
final class ContentCatalog
{
    /** @return list<array{id: string, label: string}> */
    public static function types(): array
    {
        return [
            ['id' => 'blog', 'label' => 'Блог (blog_posts)'],
            ['id' => 'pages', 'label' => 'Страницы (pages)'],
            ['id' => 'projects', 'label' => 'Проекты (projects)'],
            ['id' => 'products', 'label' => 'Товары (products)'],
            ['id' => 'services', 'label' => 'Услуги (services)'],
        ];
    }

    /** @return array{table: string, id: string, title: string, slug: string, body: string, excerpt?: string, seo_title?: string, seo_description?: string, seo_keywords?: string, status_sql: string, public_path: string}|null */
    public static function map(string $type): ?array
    {
        return match ($type) {
            'blog' => [
                'table' => 'blog_posts',
                'id' => 'id',
                'title' => 'title',
                'slug' => 'slug',
                'body' => 'content',
                'excerpt' => 'excerpt',
                'seo_title' => 'seo_title',
                'seo_description' => 'seo_description',
                'seo_keywords' => 'seo_keywords',
                'status_sql' => "status='published' AND deleted_at IS NULL",
                'public_path' => '/blog/{slug}',
            ],
            'pages' => [
                'table' => 'pages',
                'id' => 'id',
                'title' => 'title',
                'slug' => 'slug',
                'body' => 'content',
                'seo_title' => 'seo_title',
                'seo_description' => 'seo_description',
                'status_sql' => "status='published'",
                'public_path' => '/{slug}',
            ],
            'projects' => [
                'table' => 'projects',
                'id' => 'id',
                'title' => 'title',
                'slug' => 'slug',
                'body' => 'content',
                'excerpt' => 'short_description',
                'seo_title' => 'seo_title',
                'seo_description' => 'seo_description',
                'seo_keywords' => 'seo_keywords',
                'status_sql' => "status='published' AND deleted_at IS NULL",
                'public_path' => '/projects/{slug}',
            ],
            'products' => [
                'table' => 'products',
                'id' => 'id',
                'title' => 'title',
                'slug' => 'slug',
                'body' => 'description',
                'excerpt' => 'short_description',
                'status_sql' => 'is_visible=1 AND deleted_at IS NULL',
                'public_path' => '/products/{slug}',
            ],
            'services' => [
                'table' => 'services',
                'id' => 'id',
                'title' => 'title',
                'slug' => 'slug',
                'body' => 'description',
                'excerpt' => 'short_description',
                'status_sql' => 'is_visible=1',
                'public_path' => '/services/{slug}',
            ],
            default => null,
        };
    }

    /**
     * Next published item after $afterId.
     *
     * @return array<string, mixed>|null
     */
    public function nextItem(PlatformDatabaseInterface $db, string $type, int $afterId): ?array
    {
        $m = self::map($type);
        if (!$m) {
            return null;
        }
        try {
            return $db->one(
                "SELECT * FROM `{$m['table']}` WHERE {$m['status_sql']} AND `{$m['id']}` > ? ORDER BY `{$m['id']}` ASC LIMIT 1",
                [$afterId]
            );
        } catch (\Throwable) {
            return null;
        }
    }

    /**
     * @return array<string, mixed>|null
     */
    public function getItem(PlatformDatabaseInterface $db, string $type, int $id): ?array
    {
        $m = self::map($type);
        if (!$m) {
            return null;
        }
        try {
            return $db->one("SELECT * FROM `{$m['table']}` WHERE `{$m['id']}`=?", [$id]);
        } catch (\Throwable) {
            return null;
        }
    }

    /**
     * @param array<string, mixed> $fields column => value
     */
    public function updateItem(PlatformDatabaseInterface $db, string $type, int $id, array $fields): void
    {
        $m = self::map($type);
        if (!$m || $fields === []) {
            return;
        }
        $sets = [];
        $params = [];
        foreach ($fields as $col => $val) {
            if (!preg_match('/^[a-z_][a-z0-9_]*$/i', $col)) {
                continue;
            }
            $sets[] = "`{$col}`=?";
            $params[] = $val;
        }
        if ($sets === []) {
            return;
        }
        $params[] = $id;
        $db->run(
            "UPDATE `{$m['table']}` SET " . implode(',', $sets) . " WHERE `{$m['id']}`=?",
            $params
        );
    }

    /** @param array<string, mixed> $row */
    public function publicUrl(string $type, array $row): string
    {
        $m = self::map($type);
        if (!$m) {
            return '';
        }
        $slug = (string) ($row[$m['slug']] ?? '');
        if ($type === 'pages' && !empty($row['is_home'])) {
            return '/';
        }
        return str_replace('{slug}', rawurlencode($slug), $m['public_path']);
    }

    /**
     * Normalize row → logical fields for AI.
     *
     * @param array<string, mixed> $row
     * @return array{title: string, slug: string, excerpt: string, content: string, seo_title: string, seo_description: string, seo_keywords: string}
     */
    public function extract(string $type, array $row): array
    {
        $m = self::map($type);
        if (!$m) {
            return [
                'title' => '', 'slug' => '', 'excerpt' => '', 'content' => '',
                'seo_title' => '', 'seo_description' => '', 'seo_keywords' => '',
            ];
        }
        $pick = static function (array $row, ?string $col): string {
            if ($col === null || $col === '') {
                return '';
            }
            return (string) ($row[$col] ?? '');
        };
        return [
            'title' => $pick($row, $m['title']),
            'slug' => $pick($row, $m['slug']),
            'excerpt' => $pick($row, $m['excerpt'] ?? null),
            'content' => $pick($row, $m['body']),
            'seo_title' => $pick($row, $m['seo_title'] ?? null),
            'seo_description' => $pick($row, $m['seo_description'] ?? null),
            'seo_keywords' => $pick($row, $m['seo_keywords'] ?? null),
        ];
    }

    /**
     * Map logical AI fields back to DB columns (honouring allowed fields).
     *
     * @param array<string, bool> $allowed
     * @param array<string, string> $logical
     * @return array<string, string>
     */
    public function toColumns(string $type, array $allowed, array $logical): array
    {
        $m = self::map($type);
        if (!$m) {
            return [];
        }
        $out = [];
        $pairs = [
            'title' => $m['title'],
            'content' => $m['body'],
            'excerpt' => $m['excerpt'] ?? null,
            'seo_title' => $m['seo_title'] ?? null,
            'seo_description' => $m['seo_description'] ?? null,
            'seo_keywords' => $m['seo_keywords'] ?? null,
        ];
        foreach ($pairs as $logicalKey => $col) {
            if ($col === null || empty($allowed[$logicalKey])) {
                continue;
            }
            if (!array_key_exists($logicalKey, $logical)) {
                continue;
            }
            $out[$col] = $logical[$logicalKey];
        }
        return $out;
    }
}
