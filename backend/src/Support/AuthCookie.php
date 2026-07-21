<?php
declare(strict_types=1);

namespace App\Support;

/**
 * HttpOnly access-token cookie so <img src="/api/v1/media/…"> works for staff
 * (browsers do not send Authorization on image requests).
 */
final class AuthCookie
{
    public const NAME = 'portfolio_at';

    public static function set(string $accessToken, int $ttlSeconds): void
    {
        $secure = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
            || ((int) ($_SERVER['SERVER_PORT'] ?? 0) === 443)
            || (strtolower((string) ($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '')) === 'https');

        setcookie(self::NAME, $accessToken, [
            'expires' => time() + max(60, $ttlSeconds),
            'path' => '/',
            'secure' => $secure,
            'httponly' => true,
            'samesite' => 'Lax',
        ]);
    }

    public static function clear(): void
    {
        $secure = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
            || ((int) ($_SERVER['SERVER_PORT'] ?? 0) === 443)
            || (strtolower((string) ($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '')) === 'https');

        setcookie(self::NAME, '', [
            'expires' => time() - 3600,
            'path' => '/',
            'secure' => $secure,
            'httponly' => true,
            'samesite' => 'Lax',
        ]);
    }

    public static function token(): ?string
    {
        $v = $_COOKIE[self::NAME] ?? '';
        return is_string($v) && $v !== '' ? $v : null;
    }
}
