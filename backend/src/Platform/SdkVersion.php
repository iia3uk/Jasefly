<?php
declare(strict_types=1);

namespace App\Platform;

/**
 * Platform SDK generation numbers supported by this CMS build.
 */
final class SdkVersion
{
    public const CURRENT = 2;

    /** @var list<int> */
    public const SUPPORTED = [1, 2];

    public const MIN_SUPPORTED = 1;

    public static function supports(int $version): bool
    {
        return in_array($version, self::SUPPORTED, true);
    }

    public static function maxSupported(): int
    {
        return max(self::SUPPORTED);
    }

    public static function isDeprecatedGeneration(int $version): bool
    {
        return $version < self::CURRENT && self::supports($version);
    }
}
