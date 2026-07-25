<?php
declare(strict_types=1);

namespace App\Platform\Adapters;

use App\Platform\Contracts\PlatformConfigInterface;
use App\Platform\SdkVersion;

final class ConfigAdapter implements PlatformConfigInterface
{
    public function __construct(private array $app) {}

    public function get(string $key, mixed $default = null): mixed
    {
        $parts = explode('.', $key);
        $cur = $this->app;
        foreach ($parts as $p) {
            if (!is_array($cur) || !array_key_exists($p, $cur)) {
                return $default;
            }
            $cur = $cur[$p];
        }
        return $cur;
    }

    public function cmsVersion(): string
    {
        return (string) ($this->app['version'] ?? '1.0.0');
    }

    public function sdkVersion(): int
    {
        return SdkVersion::CURRENT;
    }
}
