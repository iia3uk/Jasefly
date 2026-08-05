<?php
declare(strict_types=1);

namespace App\Support;

/**
 * Shared SSRF guard for outbound HTTP (forms webhooks, automation, integrations).
 * Blocks localhost, private/reserved IPs, and unresolved hosts.
 */
final class SsrfGuard
{
    public static function isBlockedHost(string $host): bool
    {
        $host = strtolower(trim($host));
        if ($host === '') {
            return true;
        }
        if (str_starts_with($host, '[') && str_ends_with($host, ']')) {
            $host = substr($host, 1, -1);
        }
        if (in_array($host, ['localhost', '127.0.0.1', '::1'], true)) {
            return true;
        }
        if (filter_var($host, FILTER_VALIDATE_IP)) {
            return !filter_var($host, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE);
        }

        $ips = [];
        if (function_exists('dns_get_record')) {
            $records = @dns_get_record($host, DNS_A | DNS_AAAA);
            if (is_array($records)) {
                foreach ($records as $record) {
                    $ip = (string) ($record['ip'] ?? $record['ipv6'] ?? '');
                    if ($ip !== '') {
                        $ips[] = $ip;
                    }
                }
            }
        }
        if ($ips === []) {
            $resolved = gethostbyname($host);
            if ($resolved !== $host && filter_var($resolved, FILTER_VALIDATE_IP)) {
                $ips[] = $resolved;
            }
        }
        if ($ips === []) {
            // Fail closed: unresolved host must not be fetched.
            return true;
        }
        foreach ($ips as $ip) {
            if (!filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE)) {
                return true;
            }
        }
        return false;
    }

    /**
     * Resolve host to a single public IP for curl CURLOPT_RESOLVE pinning (anti DNS-rebinding).
     * @return non-empty-string|null
     */
    public static function resolvePublicIp(string $host): ?string
    {
        $host = strtolower(trim($host));
        if ($host === '' || self::isBlockedHost($host)) {
            return null;
        }
        if (filter_var($host, FILTER_VALIDATE_IP)) {
            return filter_var($host, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE)
                ? $host
                : null;
        }
        $ips = [];
        if (function_exists('dns_get_record')) {
            $records = @dns_get_record($host, DNS_A | DNS_AAAA);
            if (is_array($records)) {
                foreach ($records as $record) {
                    $ip = (string) ($record['ip'] ?? $record['ipv6'] ?? '');
                    if ($ip !== '' && filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE)) {
                        $ips[] = $ip;
                    }
                }
            }
        }
        if ($ips === []) {
            $resolved = gethostbyname($host);
            if ($resolved !== $host
                && filter_var($resolved, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE)
            ) {
                $ips[] = $resolved;
            }
        }
        return $ips[0] ?? null;
    }

    public static function isSafeHttpUrl(string $url): bool
    {
        if (!filter_var($url, FILTER_VALIDATE_URL) || !preg_match('#^https?://#i', $url)) {
            return false;
        }
        $host = (string) (parse_url($url, PHP_URL_HOST) ?? '');
        return $host !== '' && !self::isBlockedHost($host);
    }
}
