<?php
declare(strict_types=1);

namespace App\Platform\Adapters;

use App\Core\Modules\ModulePackagePaths;
use App\Platform\Contracts\PlatformAssetsInterface;

final class AssetsAdapter implements PlatformAssetsInterface
{
    public function __construct(
        private ModulePackagePaths $paths,
        private string $slug,
    ) {}

    public function modulePublicUrl(string $relativePath): string
    {
        $rel = ltrim(str_replace('\\', '/', $relativePath), '/');
        return '/modules/' . $this->slug . '/' . $rel;
    }

    public function moduleAssetPath(string $relativePath): string
    {
        $rel = ltrim(str_replace('\\', '/', $relativePath), '/');
        return $this->paths->publicModuleRoot($this->slug) . '/' . $rel;
    }
}
