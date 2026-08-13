<?php
declare(strict_types=1);

namespace App\Support;

/**
 * Hide PHP/runtime version leakage (X-Powered-By).
 *
 * Apache `Header always unset` does not remove CGI/FPM headers (different
 * header table). Never re-set X-Powered-By to an empty string — that puts
 * the header back into the CGI table and PHP-FPM fills in PHP/{version}.
 */
final class RuntimeHardening
{
    private static bool $shutdownRegistered = false;

    public static function hidePhpFingerprint(): void
    {
        @ini_set('expose_php', '0');
        self::stripPoweredBy();
        if (!self::$shutdownRegistered) {
            self::$shutdownRegistered = true;
            register_shutdown_function([self::class, 'stripPoweredBy']);
        }
    }

    public static function stripPoweredBy(): void
    {
        if (headers_sent()) {
            return;
        }
        if (function_exists('header_remove')) {
            header_remove('X-Powered-By');
        }
    }
}
