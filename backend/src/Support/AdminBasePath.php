<?php
declare(strict_types=1);

namespace App\Support;

/**
 * SPA admin UI base path (e.g. "panel" → /panel/login).
 * Does not affect /api/v1/admin — that stays fixed.
 */
final class AdminBasePath
{
    /** Public routes / first URL segments that must not become the admin base. */
    public const RESERVED = [
        'admin', // allowed as explicit default; listed for docs — not blocked
        'api',
        'assets',
        'static',
        'media',
        'register',
        'login',
        'logout',
        'about',
        'projects',
        'services',
        'products',
        'blog',
        'contact',
        'privacy',
        'search',
        'sitemap',
        'robots',
        'maintenance',
        'not-found',
        'favicon.ico',
    ];

    /** Normalize DB value to a single path segment; empty/null → "admin". */
    public static function normalize(mixed $raw): string
    {
        $s = strtolower(trim((string) ($raw ?? ''), " \t\n\r\0\x0B/"));
        if ($s === '' || $s === 'admin') {
            return 'admin';
        }
        return $s;
    }

    /**
     * Validate user input before save. Returns error message or null if ok.
     * Empty / "admin" resets to default (stored as null).
     *
     * @return array{ok:bool, value:?string, error:?string}
     */
    public static function validateForSave(mixed $raw): array
    {
        if ($raw === null || $raw === '') {
            return ['ok' => true, 'value' => null, 'error' => null];
        }
        $s = strtolower(trim((string) $raw, " \t\n\r\0\x0B/"));
        if ($s === '' || $s === 'admin') {
            return ['ok' => true, 'value' => null, 'error' => null];
        }
        if (!preg_match('/^[a-z0-9][a-z0-9-]{1,62}$/', $s)) {
            return [
                'ok' => false,
                'value' => null,
                'error' => 'Путь админки: 2–64 символа, латиница, цифры и дефис (например panel или my-cms).',
            ];
        }
        // Block reserved public segments (except allowing explicit "admin" via null above).
        $blocked = array_values(array_filter(self::RESERVED, static fn ($x) => $x !== 'admin'));
        if (in_array($s, $blocked, true)) {
            return [
                'ok' => false,
                'value' => null,
                'error' => "Путь «{$s}» занят публичным разделом сайта. Выберите другой.",
            ];
        }
        return ['ok' => true, 'value' => $s, 'error' => null];
    }

    public static function fromSiteSettings(?array $siteSettings): string
    {
        return self::normalize($siteSettings['admin_base_path'] ?? null);
    }
}
