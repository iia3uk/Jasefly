<?php
declare(strict_types=1);

namespace App\Platform\Contracts;

interface PlatformContentInterface
{
    /** @return array<string, mixed>|null */
    public function pageBySlug(string $slug): ?array;

    /** @return list<array<string, mixed>> */
    public function publishedPages(int $limit = 50): array;

    /**
     * Returns distinct human-readable CMS strings for package-side processing.
     *
     * @return list<string>
     */
    public function collectHumanReadableStrings(int $max = 2500): array;

    /**
     * Whether a content resource carries site copy.
     */
    public function isContentResource(string $resource): bool;
}
