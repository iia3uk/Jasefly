<?php
declare(strict_types=1);

namespace App\Support;

use App\Request;

/**
 * Allowlist Origin / Referer for browser-authenticated mutating admin API calls.
 * MCP machine Bearer is excluded (checked against mcp_api_token before Auth runs).
 */
final class OriginGuard
{
    /**
     * @param array<string, mixed> $app
     * @return list<string> normalized origins (scheme://host[:port])
     */
    public static function allowlistFromApp(array $app): array
    {
        $out = [];
        foreach ([
            (string) ($app['public_url'] ?? ''),
            (string) ($app['app_url'] ?? ''),
            (string) ($app['url'] ?? ''),
        ] as $candidate) {
            $origin = self::normalizeOrigin($candidate);
            if ($origin !== null) {
                $out[] = $origin;
            }
        }
        $cors = $app['cors_origins'] ?? [];
        if (is_array($cors)) {
            foreach ($cors as $entry) {
                if (!is_string($entry) || $entry === '' || $entry === '*') {
                    continue;
                }
                $origin = self::normalizeOrigin($entry);
                if ($origin !== null) {
                    $out[] = $origin;
                }
            }
        }
        $hosts = $app['allowed_hosts'] ?? [];
        if (is_array($hosts)) {
            foreach ($hosts as $host) {
                if (!is_string($host) || $host === '') {
                    continue;
                }
                $hostOnly = PublicOrigin::hostWithoutPort($host);
                if ($hostOnly === '' || !PublicOrigin::isValidHostHeader($hostOnly)) {
                    continue;
                }
                $out[] = 'https://' . strtolower($hostOnly);
                $out[] = 'http://' . strtolower($hostOnly);
            }
        }
        // Shared-hosting fallback: trust the current request Host when config URLs are empty.
        $reqHost = (string) ($_SERVER['HTTP_HOST'] ?? '');
        if ($out === [] && PublicOrigin::isValidHostHeader($reqHost)) {
            $https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
                || (($_SERVER['SERVER_PORT'] ?? '') === '443')
                || (strtolower((string) ($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '')) === 'https');
            $out[] = ($https ? 'https' : 'http') . '://' . strtolower(PublicOrigin::hostWithoutPort($reqHost));
        }
        return array_values(array_unique($out));
    }

    /**
     * @param array<string, mixed> $app
     */
    public static function requiresCheck(Request $r, array $app = []): bool
    {
        $method = strtoupper($r->method);
        if (!in_array($method, ['POST', 'PUT', 'PATCH', 'DELETE'], true)) {
            return false;
        }
        // Admin mutations (+ auth setup). Public forms keep their own CSRF tokens.
        if (!str_contains($r->path, '/admin/') && !preg_match('#/auth/(?!demo/)#', $r->path)) {
            return false;
        }

        // Telegram deploy webhook is public (authenticated via secret_token).
        if (str_contains($r->path, '/telegram/deploy-webhook')) {
            return false;
        }

        // Machine MCP token — never require browser Origin (global MW runs before Auth).
        if (self::isMcpRequest($r, $app)) {
            return false;
        }

        $origin = $r->header('Origin');
        $referer = $r->header('Referer');
        // Non-browser clients (curl / MCP without Origin) — skip.
        if ((!is_string($origin) || $origin === '') && (!is_string($referer) || $referer === '')) {
            return false;
        }
        return true;
    }

    /**
     * @param array<string, mixed> $app
     */
    public static function isMcpRequest(Request $r, array $app = []): bool
    {
        if (($r->user['auth'] ?? '') === 'mcp_token') {
            return true;
        }
        $mcp = (string) ($app['mcp_api_token'] ?? '');
        if ($mcp === '') {
            return false;
        }
        $bearer = $r->bearer() ?? '';
        return $bearer !== '' && hash_equals($mcp, $bearer);
    }

    /**
     * @param list<string> $allowlist
     */
    public static function isAllowed(?string $origin, ?string $referer, array $allowlist): bool
    {
        if ($allowlist === []) {
            // Misconfigured host: reject explicit foreign Origin, allow missing Origin.
            if ($origin !== null && $origin !== '') {
                return false;
            }
            return true;
        }
        if ($origin !== null && $origin !== '') {
            $norm = self::normalizeOrigin($origin);
            return $norm !== null && self::inAllowlist($norm, $allowlist);
        }
        if ($referer !== null && $referer !== '') {
            $norm = self::normalizeOrigin($referer);
            return $norm !== null && self::inAllowlist($norm, $allowlist);
        }
        return true;
    }

    public static function normalizeOrigin(string $raw): ?string
    {
        $raw = trim($raw);
        if ($raw === '') {
            return null;
        }
        if (!preg_match('#^https?://#i', $raw)) {
            return null;
        }
        $parts = parse_url($raw);
        if (!is_array($parts) || empty($parts['scheme']) || empty($parts['host'])) {
            return null;
        }
        if (!PublicOrigin::isValidHostHeader((string) $parts['host'])) {
            return null;
        }
        $origin = strtolower((string) $parts['scheme']) . '://' . strtolower((string) $parts['host']);
        if (isset($parts['port'])) {
            $origin .= ':' . (int) $parts['port'];
        }
        return $origin;
    }

    /** @param list<string> $allowlist */
    private static function inAllowlist(string $origin, array $allowlist): bool
    {
        foreach ($allowlist as $allowed) {
            if (strcasecmp($origin, $allowed) === 0) {
                return true;
            }
        }
        return false;
    }
}
