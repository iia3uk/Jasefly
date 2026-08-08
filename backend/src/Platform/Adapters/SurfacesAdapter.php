<?php
declare(strict_types=1);

namespace App\Platform\Adapters;

use App\Platform\Contracts\PlatformSurfacesInterface;
use App\Platform\Surfaces\PackageSurfaceRegistry;

final class SurfacesAdapter implements PlatformSurfacesInterface
{
    public function __construct(private string $ownerSlug) {}

    public function register(array $surfaces): void
    {
        PackageSurfaceRegistry::register($this->ownerSlug, $surfaces);
    }
}
