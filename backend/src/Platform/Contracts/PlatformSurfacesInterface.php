<?php
declare(strict_types=1);

namespace App\Platform\Contracts;

/**
 * Package → host surface registration (trash, dashboard, sitemap, media, ACL, schema).
 */
interface PlatformSurfacesInterface
{
    /**
     * @param array<string, mixed> $surfaces
     */
    public function register(array $surfaces): void;
}
