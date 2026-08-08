<?php
declare(strict_types=1);

namespace App\Support;

/**
 * Shared outbound HTTP with SSRF guard, http(s)-only protocols, and DNS pin.
 */
final class OutboundHttp
{
    /**
     * @param array|string $body Array is JSON-encoded; string is sent as-is
     * @param list<string> $headers Extra header lines (e.g. signatures)
     */
    public static function postJson(string $url, array|string $body, array $headers = [], int $timeout = 5): bool
    {
        $res = self::request($url, [
            'method' => 'POST',
            'body' => $body,
            'headers' => array_merge(['Content-Type: application/json'], $headers),
            'timeout' => $timeout,
        ]);
        return (bool) ($res['ok'] ?? false);
    }

    /**
     * Response-bearing outbound request for acquiring / provider APIs.
     *
     * @param array{
     *   method?: string,
     *   body?: array<string, mixed>|string|null,
     *   headers?: list<string>,
     *   timeout?: int,
     *   json?: bool
     * } $options
     * @return array{ok:bool, status:int, body:string, json:?array, error?:string}
     */
    public static function request(string $url, array $options = []): array
    {
        if (!SsrfGuard::isSafeHttpUrl($url)) {
            return ['ok' => false, 'status' => 0, 'body' => '', 'json' => null, 'error' => 'unsafe_url'];
        }
        if (!function_exists('curl_init')) {
            return ['ok' => false, 'status' => 0, 'body' => '', 'json' => null, 'error' => 'curl_missing'];
        }
        $host = (string) (parse_url($url, PHP_URL_HOST) ?? '');
        $scheme = strtolower((string) (parse_url($url, PHP_URL_SCHEME) ?? 'http'));
        $port = (int) (parse_url($url, PHP_URL_PORT) ?? ($scheme === 'https' ? 443 : 80));
        $pinIp = SsrfGuard::resolvePublicIp($host);
        if ($pinIp === null) {
            return ['ok' => false, 'status' => 0, 'body' => '', 'json' => null, 'error' => 'dns_pin_failed'];
        }

        $method = strtoupper((string) ($options['method'] ?? 'GET'));
        if (!in_array($method, ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD'], true)) {
            return ['ok' => false, 'status' => 0, 'body' => '', 'json' => null, 'error' => 'method_not_allowed'];
        }

        $headers = $options['headers'] ?? [];
        if (!is_array($headers)) {
            $headers = [];
        }
        /** @var list<string> $headers */
        $timeout = max(1, (int) ($options['timeout'] ?? 45));
        $rawBody = $options['body'] ?? null;
        $asJson = !empty($options['json']);
        $payload = null;
        if ($method !== 'GET' && $method !== 'HEAD') {
            if (is_array($rawBody)) {
                if ($asJson || self::headerHas($headers, 'Content-Type: application/json')) {
                    $payload = json_encode($rawBody, JSON_UNESCAPED_UNICODE);
                    if ($payload === false) {
                        return ['ok' => false, 'status' => 0, 'body' => '', 'json' => null, 'error' => 'json_encode_failed'];
                    }
                    if (!self::headerHas($headers, 'Content-Type:')) {
                        $headers[] = 'Content-Type: application/json';
                    }
                } else {
                    $payload = http_build_query($rawBody);
                    if (!self::headerHas($headers, 'Content-Type:')) {
                        $headers[] = 'Content-Type: application/x-www-form-urlencoded';
                    }
                }
            } elseif (is_string($rawBody)) {
                $payload = $rawBody;
            } else {
                $payload = '';
            }
        }

        $ch = curl_init($url);
        if ($ch === false) {
            return ['ok' => false, 'status' => 0, 'body' => '', 'json' => null, 'error' => 'curl_init_failed'];
        }
        $opts = [
            CURLOPT_CUSTOMREQUEST => $method,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_HTTPHEADER => $headers,
            CURLOPT_TIMEOUT => $timeout,
            CURLOPT_PROTOCOLS => CURLPROTO_HTTP | CURLPROTO_HTTPS,
            CURLOPT_RESOLVE => [$host . ':' . $port . ':' . $pinIp],
        ];
        if ($payload !== null && $method !== 'GET' && $method !== 'HEAD') {
            $opts[CURLOPT_POSTFIELDS] = $payload;
        }
        curl_setopt_array($ch, $opts);
        $raw = curl_exec($ch);
        $status = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $errno = curl_errno($ch);
        $err = curl_error($ch);
        curl_close($ch);

        if ($raw === false || $errno !== 0) {
            return [
                'ok' => false,
                'status' => $status,
                'body' => '',
                'json' => null,
                'error' => $err !== '' ? $err : 'curl_error',
            ];
        }

        $body = (string) $raw;
        $decoded = json_decode($body, true);
        return [
            'ok' => true,
            'status' => $status,
            'body' => $body,
            'json' => is_array($decoded) ? $decoded : null,
        ];
    }

    /** @param list<string> $headers */
    private static function headerHas(array $headers, string $prefix): bool
    {
        $prefix = strtolower($prefix);
        foreach ($headers as $h) {
            if (str_starts_with(strtolower((string) $h), $prefix)) {
                return true;
            }
        }
        return false;
    }
}
