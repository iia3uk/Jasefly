<?php
declare(strict_types=1);

namespace App\Support;

/**
 * Shared outbound JSON POST with SSRF guard, http(s)-only protocols, and DNS pin.
 */
final class OutboundHttp
{
    /**
     * @param array|string $body Array is JSON-encoded; string is sent as-is
     * @param list<string> $headers Extra header lines (e.g. signatures)
     */
    public static function postJson(string $url, array|string $body, array $headers = [], int $timeout = 5): bool
    {
        if (!SsrfGuard::isSafeHttpUrl($url)) {
            return false;
        }
        if (!function_exists('curl_init')) {
            return false;
        }
        $host = (string) (parse_url($url, PHP_URL_HOST) ?? '');
        $scheme = strtolower((string) (parse_url($url, PHP_URL_SCHEME) ?? 'http'));
        $port = (int) (parse_url($url, PHP_URL_PORT) ?? ($scheme === 'https' ? 443 : 80));
        $pinIp = SsrfGuard::resolvePublicIp($host);
        if ($pinIp === null) {
            return false;
        }
        $payload = is_string($body) ? $body : json_encode($body, JSON_UNESCAPED_UNICODE);
        if ($payload === false || $payload === '') {
            return false;
        }
        $hdrs = array_merge(['Content-Type: application/json'], $headers);
        $ch = curl_init($url);
        if ($ch === false) {
            return false;
        }
        $opts = [
            CURLOPT_POST => true,
            CURLOPT_POSTFIELDS => $payload,
            CURLOPT_HTTPHEADER => $hdrs,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => max(1, $timeout),
            CURLOPT_PROTOCOLS => CURLPROTO_HTTP | CURLPROTO_HTTPS,
            // Pin DNS at connect time — closes rebinding TOCTOU after SsrfGuard check.
            CURLOPT_RESOLVE => [$host . ':' . $port . ':' . $pinIp],
        ];
        curl_setopt_array($ch, $opts);
        curl_exec($ch);
        $ok = curl_errno($ch) === 0;
        curl_close($ch);
        return $ok;
    }
}
