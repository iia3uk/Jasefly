<?php
declare(strict_types=1);

namespace App\Platform\Contracts;

interface PlatformAssetsInterface
{
    public function modulePublicUrl(string $relativePath): string;

    public function moduleAssetPath(string $relativePath): string;
}
