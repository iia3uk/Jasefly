<?php
declare(strict_types=1);

namespace App\Modules\Translate;

use App\Request;

/**
 * Visitor country → UI language for the public translate overlay.
 * Headers: Cloudflare / common CDN / Accept-Language fallback.
 */
final class TranslateGeo
{
    /** ISO 3166-1 alpha-2 → BCP47-ish lang code used by the widget. */
    private const COUNTRY_LANG = [
        'RU' => 'ru', 'BY' => 'ru', 'KZ' => 'ru', 'KG' => 'ru', 'UZ' => 'ru', 'TJ' => 'ru', 'AM' => 'ru', 'AZ' => 'ru',
        'UA' => 'uk',
        'DE' => 'de', 'AT' => 'de', 'LI' => 'de',
        'CH' => 'de',
        'FR' => 'fr', 'BE' => 'fr', 'LU' => 'fr', 'MC' => 'fr',
        'ES' => 'es', 'MX' => 'es', 'AR' => 'es', 'CO' => 'es', 'CL' => 'es', 'PE' => 'es', 'VE' => 'es',
        'UY' => 'es', 'EC' => 'es', 'BO' => 'es', 'PY' => 'es', 'CR' => 'es', 'PA' => 'es', 'GT' => 'es',
        'IT' => 'it', 'SM' => 'it', 'VA' => 'it',
        'PT' => 'pt', 'BR' => 'pt', 'AO' => 'pt', 'MZ' => 'pt',
        'PL' => 'pl',
        'TR' => 'tr',
        'NL' => 'nl', 'SR' => 'nl',
        'JP' => 'ja',
        'CN' => 'zh', 'TW' => 'zh', 'HK' => 'zh', 'MO' => 'zh',
        'SA' => 'ar', 'AE' => 'ar', 'EG' => 'ar', 'IQ' => 'ar', 'MA' => 'ar', 'DZ' => 'ar', 'QA' => 'ar', 'KW' => 'ar',
        'US' => 'en', 'GB' => 'en', 'AU' => 'en', 'CA' => 'en', 'NZ' => 'en', 'IE' => 'en', 'IN' => 'en',
        'SG' => 'en', 'PH' => 'en', 'ZA' => 'en', 'NG' => 'en', 'KE' => 'en', 'PK' => 'en', 'BD' => 'en',
        'SE' => 'en', 'NO' => 'en', 'DK' => 'en', 'FI' => 'en', 'IS' => 'en',
        'CZ' => 'en', 'SK' => 'en', 'HU' => 'en', 'RO' => 'en', 'BG' => 'en', 'GR' => 'en',
        'IL' => 'en', 'KR' => 'en', 'TH' => 'en', 'VN' => 'en', 'ID' => 'en', 'MY' => 'en',
    ];

    /**
     * @param list<string> $targets widget target langs (lowercase)
     * @return array{country: string|null, suggested_lang: string, via: string}
     */
    public static function suggest(string $source, array $targets, ?Request $request = null): array
    {
        $source = strtolower(trim($source)) ?: 'ru';
        $targets = array_values(array_filter(array_map(
            static fn ($t) => strtolower(trim((string) $t)),
            $targets
        )));

        $country = self::detectCountry($request);
        $via = 'default';
        $mapped = null;

        if ($country !== null && isset(self::COUNTRY_LANG[$country])) {
            $mapped = self::COUNTRY_LANG[$country];
            $via = 'country';
        }

        if ($mapped === null) {
            $mapped = self::fromAcceptLanguage($request);
            if ($mapped !== null) {
                $via = 'accept-language';
            }
        }

        $suggested = self::resolve($mapped, $source, $targets);
        if ($via === 'default' || ($mapped !== null && $suggested !== $mapped && $suggested === 'en')) {
            // Mapped lang not available → neutral en (or source if en unavailable).
            if ($suggested === 'en' && $mapped !== 'en') {
                $via = $via === 'default' ? 'neutral-en' : ($via . '+fallback-en');
            }
        }
        if ($mapped === null && $suggested === 'en') {
            $via = 'neutral-en';
        }
        if ($mapped === null && $suggested === $source) {
            $via = 'source';
        }

        return [
            'country' => $country,
            'suggested_lang' => $suggested,
            'via' => $via,
        ];
    }

    /**
     * Pick best lang: mapped if source/target; else neutral en; else source.
     *
     * @param list<string> $targets
     */
    public static function resolve(?string $mapped, string $source, array $targets): string
    {
        $source = strtolower($source) ?: 'ru';
        if ($mapped !== null) {
            $mapped = strtolower($mapped);
            if ($mapped === $source) {
                return $source;
            }
            if (in_array($mapped, $targets, true)) {
                return $mapped;
            }
        }
        // Neutral English when country language is missing from the widget.
        if ($source === 'en' || in_array('en', $targets, true)) {
            return 'en';
        }
        // en not configured — still suggest en for overlay (batch allows it as neutral).
        return 'en';
    }

    public static function detectCountry(?Request $request = null): ?string
    {
        $headers = [
            'HTTP_CF_IPCOUNTRY', // Cloudflare
            'HTTP_CLOUDFRONT_VIEWER_COUNTRY',
            'HTTP_X_COUNTRY_CODE',
            'HTTP_X_GEO_COUNTRY',
            'HTTP_X_APPENGINE_COUNTRY',
            'GEOIP_COUNTRY_CODE',
            'HTTP_X_VERCEL_IP_COUNTRY',
        ];

        foreach ($headers as $key) {
            $raw = self::server($key, $request);
            $code = self::normalizeCountry($raw);
            if ($code !== null) {
                return $code;
            }
        }

        // Some hosts put country on a custom env.
        $env = getenv('CMS_VISITOR_COUNTRY') ?: ($_ENV['CMS_VISITOR_COUNTRY'] ?? '');
        return self::normalizeCountry(is_string($env) ? $env : null);
    }

    public static function fromAcceptLanguage(?Request $request = null): ?string
    {
        $raw = self::server('HTTP_ACCEPT_LANGUAGE', $request);
        if ($raw === null || $raw === '') {
            $h = $request?->header('Accept-Language');
            $raw = $h;
        }
        if ($raw === null || trim($raw) === '') {
            return null;
        }
        // "fr-CH,fr;q=0.9,en;q=0.8" → first primary tag
        $parts = preg_split('/\s*,\s*/', $raw) ?: [];
        foreach ($parts as $part) {
            $tag = strtolower(trim(explode(';', $part, 2)[0]));
            if ($tag === '' || $tag === '*') {
                continue;
            }
            $primary = preg_replace('/[^a-z].*$/', '', $tag) ?? '';
            if (strlen($primary) === 2) {
                return $primary;
            }
        }
        return null;
    }

    private static function normalizeCountry(?string $raw): ?string
    {
        if ($raw === null) {
            return null;
        }
        $code = strtoupper(trim($raw));
        if ($code === '' || $code === 'XX' || $code === 'T1' || $code === 'ZZ') {
            return null;
        }
        if (!preg_match('/^[A-Z]{2}$/', $code)) {
            return null;
        }
        return $code;
    }

    private static function server(string $key, ?Request $request): ?string
    {
        if ($request) {
            // Request::header expects "Cf-Ipcountry" style; also poke $_SERVER.
            $name = str_replace('_', '-', preg_replace('/^HTTP_/', '', $key) ?? $key);
            $h = $request->header($name);
            if (is_string($h) && trim($h) !== '') {
                return $h;
            }
        }
        $v = $_SERVER[$key] ?? null;
        return is_string($v) && $v !== '' ? $v : null;
    }
}
