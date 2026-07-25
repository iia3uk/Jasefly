<?php
declare(strict_types=1);

namespace App\Platform\Contracts;

interface PlatformCacheInterface
{
    public function get(string $key, mixed $default = null): mixed;

    public function set(string $key, mixed $value, int $ttlSeconds = 300): void;

    public function delete(string $key): void;
}
