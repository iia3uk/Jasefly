<?php
declare(strict_types=1);

namespace App\Modules\Demo;

/** HttpOnly cookie for demo JWT (separate from production AuthCookie). */
final class DemoCookie
{
    public const NAME = 'jasefly_demo';

    public static function set(string $token, int $ttlSeconds): void
    {
        $secure = self::secure();
        setcookie(self::NAME, $token, [
            'expires' => time() + max(60, $ttlSeconds),
            'path' => '/',
            'secure' => $secure,
            'httponly' => true,
            'samesite' => 'Lax',
        ]);
    }

    public static function clear(): void
    {
        setcookie(self::NAME, '', [
            'expires' => time() - 3600,
            'path' => '/',
            'secure' => self::secure(),
            'httponly' => true,
            'samesite' => 'Lax',
        ]);
    }

    public static function token(): ?string
    {
        $v = $_COOKIE[self::NAME] ?? '';
        return is_string($v) && $v !== '' ? $v : null;
    }

    private static function secure(): bool
    {
        return (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
            || ((int) ($_SERVER['SERVER_PORT'] ?? 0) === 443)
            || (strtolower((string) ($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '')) === 'https');
    }
}
