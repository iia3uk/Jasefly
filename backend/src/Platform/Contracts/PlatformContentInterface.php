<?php
declare(strict_types=1);

namespace App\Platform\Contracts;

interface PlatformContentInterface
{
    /** @return array<string, mixed>|null */
    public function pageBySlug(string $slug): ?array;

    /** @return list<array<string, mixed>> */
    public function publishedPages(int $limit = 50): array;
}
