<?php
declare(strict_types=1);

namespace App\Platform;

/**
 * Platform SDK generation numbers supported by this CMS build.
 *
 * Stability: generation 1 is `stable` (Forms SDK reference certified).
 * Generation 2 is `current`.
 */
final class SdkVersion
{
    public const CURRENT = 2;

    /** @var list<int> */
    public const SUPPORTED = [1, 2];

    public const MIN_SUPPORTED = 1;

    /** @var array<int, 'stable'|'current'|'candidate'|'deprecated'> */
    public const STABILITY = [
        1 => 'stable',
        2 => 'current',
    ];

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

    public static function stability(int $version): string
    {
        return self::STABILITY[$version] ?? 'unsupported';
    }

    public static function isStable(int $version): bool
    {
        return self::stability($version) === 'stable';
    }

    /** Mark generation 1 stable after successful certification (called once from freeze step). */
    public static function markStable(int $version): void
    {
        // Stability map is const — freeze edits this file to STABILITY[1]='stable'.
        // Runtime helper for tests/docs only.
        if (!self::supports($version)) {
            throw new \InvalidArgumentException('Unsupported SDK generation: ' . $version);
        }
    }
}
