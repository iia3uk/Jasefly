<?php
declare(strict_types=1);

namespace App\Support;

use App\Router;

/**
 * Public, non-sensitive platform identity for CMS/framework detectors.
 *
 * Intentionally does not emit X-Powered-By (stripped to hide PHP/runtime versions).
 * Canonical HTTP signal is X-Jasefly: 1. JSON body is only { "platform": "Jasefly" }.
 */
final class PlatformFingerprint
{
    public const PLATFORM = 'Jasefly';
    public const HEADER_NAME = 'X-Jasefly';
    public const HEADER_VALUE = '1';
    public const GENERATOR = 'Jasefly';
    public const WELL_KNOWN_PATH = '/.well-known/jasefly';

    /** @return array{platform: string} */
    public static function payload(): array
    {
        return ['platform' => self::PLATFORM];
    }

    public static function json(): string
    {
        $encoded = json_encode(self::payload(), JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
        return is_string($encoded) ? $encoded : '{"platform":"Jasefly"}';
    }

    public static function generatorMetaTag(): string
    {
        return '<meta name="generator" content="' . self::GENERATOR . '">';
    }

    public static function isWellKnownPath(string $path): bool
    {
        $normalized = '/' . trim(str_replace('\\', '/', $path), '/');
        return $normalized === self::WELL_KNOWN_PATH;
    }

    public static function applyResponseHeaders(): void
    {
        header(self::HEADER_NAME . ': ' . self::HEADER_VALUE);
    }

    public static function register(Router $router): void
    {
        $router->get(self::WELL_KNOWN_PATH, static fn () => self::sendWellKnown());
    }

    public static function sendWellKnown(): never
    {
        http_response_code(200);
        header('Content-Type: application/json; charset=utf-8');
        header('Cache-Control: public, max-age=86400, must-revalidate');
        header('X-Content-Type-Options: nosniff');
        self::applyResponseHeaders();
        echo self::json();
        exit;
    }
}
