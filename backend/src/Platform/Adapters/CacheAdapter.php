<?php
declare(strict_types=1);

namespace App\Platform\Adapters;

use App\Platform\Contracts\PlatformCacheInterface;

/** In-process cache with automatic module key prefix. */
final class CacheAdapter implements PlatformCacheInterface
{
    /** @var array<string, array{value:mixed, exp:int}> */
    private static array $mem = [];

    public function __construct(private string $moduleSlug = '') {}

    public function get(string $key, mixed $default = null): mixed
    {
        $row = self::$mem[$this->ns($key)] ?? null;
        if ($row === null) {
            return $default;
        }
        if ($row['exp'] > 0 && time() > $row['exp']) {
            unset(self::$mem[$this->ns($key)]);
            return $default;
        }
        return $row['value'];
    }

    public function set(string $key, mixed $value, int $ttlSeconds = 300): void
    {
        self::$mem[$this->ns($key)] = [
            'value' => $value,
            'exp' => $ttlSeconds > 0 ? time() + $ttlSeconds : 0,
        ];
    }

    public function delete(string $key): void
    {
        unset(self::$mem[$this->ns($key)]);
    }

    private function ns(string $key): string
    {
        $key = ltrim($key, '/');
        if ($key === '' || str_contains($key, '..')) {
            throw new \InvalidArgumentException('Invalid cache key');
        }
        $slug = $this->moduleSlug !== '' ? $this->moduleSlug : '_platform';
        return $slug . ':' . $key;
    }
}
