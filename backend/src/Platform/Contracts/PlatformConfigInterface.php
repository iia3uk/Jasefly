<?php
declare(strict_types=1);

namespace App\Platform\Contracts;

interface PlatformConfigInterface
{
    public function get(string $key, mixed $default = null): mixed;

    public function cmsVersion(): string;

    public function sdkVersion(): int;
}
