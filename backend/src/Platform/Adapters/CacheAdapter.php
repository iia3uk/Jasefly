<?php
declare(strict_types=1);

namespace App\Platform\Adapters;

use App\Platform\Contracts\PlatformCacheInterface;

final class CacheAdapter implements PlatformCacheInterface
{
    /** @var array<string, array{value:mixed, exp:int}> */
    private static array $mem = [];

    public function get(string $key, mixed $default = null): mixed
    {
        $row = self::$mem[$key] ?? null;
        if ($row === null) {
            return $default;
        }
        if ($row['exp'] > 0 && time() > $row['exp']) {
            unset(self::$mem[$key]);
            return $default;
        }
        return $row['value'];
    }

    public function set(string $key, mixed $value, int $ttlSeconds = 300): void
    {
        self::$mem[$key] = [
            'value' => $value,
            'exp' => $ttlSeconds > 0 ? time() + $ttlSeconds : 0,
        ];
    }

    public function delete(string $key): void
    {
        unset(self::$mem[$key]);
    }
}
