<?php
declare(strict_types=1);

namespace App\Support;

use App\Database;

/**
 * Resolve absolute public origin for verification / payment URLs.
 * Prefer configured app_url / public_url / seo canonical; Host header only as
 * validated fallback (shared hosting without proxy).
 */
final class PublicOrigin
{
    /**
     * @param array<string, mixed> $app
     */
    public static function resolve(?Database $db, array $app = []): string
    {
        $candidates = [
            (string) ($app['public_url'] ?? ''),
            (string) ($app['app_url'] ?? ''),
            (string) ($app['url'] ?? ''),
        ];
        if ($db !== null) {
            try {
                $seo = $db->one('SELECT canonical_base_url FROM seo_settings LIMIT 1');
                if (is_array($seo)) {
                    array_unshift($candidates, (string) ($seo['canonical_base_url'] ?? ''));
                }
            } catch (\Throwable) {
            }
        }
        foreach ($candidates as $candidate) {
            $origin = self::normalizeConfiguredOrigin((string) $candidate);
            if ($origin !== null) {
                return $origin;
            }
        }
        return self::fallbackFromRequest($app);
    }

    /**
     * @param array<string, mixed> $app
     */
    public static function fallbackFromRequest(array $app = []): string
    {
        $hostHeader = (string) ($_SERVER['HTTP_HOST'] ?? '');
        if (!self::isValidHostHeader($hostHeader)) {
            return '';
        }
        $allowed = $app['allowed_hosts'] ?? null;
        if (is_array($allowed) && $allowed !== []) {
            $hostOnly = self::hostWithoutPort($hostHeader);
            $ok = false;
            foreach ($allowed as $entry) {
                if (!is_string($entry)) {
                    continue;
                }
                if (strcasecmp(self::hostWithoutPort($entry), $hostOnly) === 0) {
                    $ok = true;
                    break;
                }
            }
            if (!$ok) {
                return '';
            }
        }
        $https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
            || (($_SERVER['SERVER_PORT'] ?? '') === '443');
        return ($https ? 'https' : 'http') . '://' . $hostHeader;
    }

    public static function isValidHostHeader(string $host): bool
    {
        $host = trim($host);
        if ($host === '' || strlen($host) > 253) {
            return false;
        }
        if (preg_match('/[\s\\\\\/@\x00-\x1f]/', $host)) {
            return false;
        }
        $hostOnly = self::hostWithoutPort($host);
        if ($hostOnly === '') {
            return false;
        }
        if (filter_var($hostOnly, FILTER_VALIDATE_IP)) {
            return true;
        }
        if (strcasecmp($hostOnly, 'localhost') === 0) {
            return true;
        }
        // DNS hostname grammar (labels 1–63, overall ≤253). Reject underscores / leading dots.
        return (bool) preg_match(
            '/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i',
            $hostOnly
        );
    }

    public static function hostWithoutPort(string $host): string
    {
        $host = trim($host);
        if (str_starts_with($host, '[') && preg_match('/^\[([^\]]+)\](?::\d+)?$/', $host, $m)) {
            return $m[1];
        }
        if (substr_count($host, ':') === 1 && preg_match('/^([^:]+):(\d+)$/', $host, $m)) {
            $port = (int) $m[2];
            if ($port < 1 || $port > 65535) {
                return '';
            }
            return $m[1];
        }
        return $host;
    }

    private static function normalizeConfiguredOrigin(string $raw): ?string
    {
        $raw = rtrim(trim($raw), '/');
        if ($raw === '' || !preg_match('#^https?://#i', $raw)) {
            return null;
        }
        $parts = parse_url($raw);
        if (!is_array($parts) || empty($parts['scheme']) || empty($parts['host'])) {
            return null;
        }
        if (!self::isValidHostHeader((string) $parts['host'] . (isset($parts['port']) ? ':' . $parts['port'] : ''))) {
            return null;
        }
        $origin = strtolower((string) $parts['scheme']) . '://' . $parts['host'];
        if (isset($parts['port'])) {
            $origin .= ':' . (int) $parts['port'];
        }
        return $origin;
    }
}
