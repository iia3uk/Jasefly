<?php
declare(strict_types=1);

namespace App\Platform\Compatibility;

use App\Platform\PlatformContext;
use App\Platform\SdkVersion;

/**
 * Adapts module SDK generations to the current platform surface.
 * v1 and v2 share PlatformContext; v1 uses deprecated aliases (db()).
 */
final class CompatibilityLayer
{
    public static function wrap(PlatformContext $ctx, int $moduleSdkVersion): PlatformContext
    {
        if (!SdkVersion::supports($moduleSdkVersion)) {
            throw new \RuntimeException(
                'Unsupported SDK version ' . $moduleSdkVersion
                . '; platform supports ' . implode(', ', SdkVersion::SUPPORTED)
            );
        }
        // Future: return SdkV1Facade / SdkV2Facade decorators when APIs diverge further.
        return $ctx;
    }

    /**
     * @return array{ok:bool, errors:list<string>, warnings:list<string>}
     */
    public static function checkSdkVersion(int $moduleSdkVersion): array
    {
        $errors = [];
        $warnings = [];
        if ($moduleSdkVersion > SdkVersion::maxSupported()) {
            $errors[] = 'Module requires SDK v' . $moduleSdkVersion
                . ' but platform max is v' . SdkVersion::maxSupported();
        } elseif ($moduleSdkVersion < SdkVersion::MIN_SUPPORTED) {
            $errors[] = 'Module SDK v' . $moduleSdkVersion . ' is no longer supported';
        } elseif (SdkVersion::isDeprecatedGeneration($moduleSdkVersion)) {
            $warnings[] = 'Module uses deprecated SDK v' . $moduleSdkVersion
                . '; current is v' . SdkVersion::CURRENT . ' (still supported via Compatibility Layer)';
        }
        return ['ok' => $errors === [], 'errors' => $errors, 'warnings' => $warnings];
    }
}
