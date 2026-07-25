<?php
declare(strict_types=1);

namespace App\Platform\Adapters;

use App\Database;
use App\Platform\Contracts\PlatformContentInterface;

final class ContentAdapter implements PlatformContentInterface
{
    public function __construct(private Database $db) {}

    public function pageBySlug(string $slug): ?array
    {
        try {
            return $this->db->one(
                "SELECT * FROM pages WHERE slug=? AND status='published' LIMIT 1",
                [$slug]
            );
        } catch (\Throwable) {
            return null;
        }
    }

    public function publishedPages(int $limit = 50): array
    {
        $limit = max(1, min(200, $limit));
        try {
            return $this->db->all(
                "SELECT id, slug, title, status FROM pages WHERE status='published' ORDER BY id DESC LIMIT {$limit}"
            );
        } catch (\Throwable) {
            return [];
        }
    }
}
