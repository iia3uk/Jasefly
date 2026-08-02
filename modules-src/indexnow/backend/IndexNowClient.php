<?php
declare(strict_types=1);

namespace App\PackageModules\Indexnow;

/**
 * HTTP client for IndexNow endpoints (Yandex, api.indexnow.org, …).
 */
final class IndexNowClient
{
    /**
     * @param list<string> $urls Absolute URLs
     * @return array{ok: bool, status: int, body: string, error?: string|null}
     */
    public function submit(string $endpoint, string $host, string $key, array $urls, ?string $keyLocation = null): array
    {
        $endpoint = trim($endpoint);
        if ($endpoint === '' || !$this->isSafeEndpoint($endpoint)) {
            return ['ok' => false, 'status' => 0, 'body' => '', 'error' => 'unsafe_endpoint'];
        }
        if (!function_exists('curl_init')) {
            return ['ok' => false, 'status' => 0, 'body' => '', 'error' => 'curl_missing'];
        }

        $urls = array_values(array_unique(array_filter(array_map('strval', $urls))));
        if ($urls === []) {
            return ['ok' => false, 'status' => 0, 'body' => '', 'error' => 'empty_urls'];
        }
        if (count($urls) > 10000) {
            $urls = array_slice($urls, 0, 10000);
        }

        $payload = [
            'host' => $host,
            'key' => $key,
            'urlList' => $urls,
        ];
        if ($keyLocation !== null && $keyLocation !== '') {
            $payload['keyLocation'] = $keyLocation;
        }

        $json = json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        if ($json === false) {
            return ['ok' => false, 'status' => 0, 'body' => '', 'error' => 'json_encode'];
        }

        $ch = curl_init($endpoint);
        if ($ch === false) {
            return ['ok' => false, 'status' => 0, 'body' => '', 'error' => 'curl_init'];
        }
        $responseHeaders = [];
        curl_setopt_array($ch, [
            CURLOPT_POST => true,
            CURLOPT_POSTFIELDS => $json,
            CURLOPT_HTTPHEADER => [
                'Content-Type: application/json; charset=utf-8',
            ],
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_HEADERFUNCTION => static function ($ch, string $headerLine) use (&$responseHeaders): int {
                $len = strlen($headerLine);
                $parts = explode(':', $headerLine, 2);
                if (count($parts) === 2) {
                    $responseHeaders[strtolower(trim($parts[0]))] = trim($parts[1]);
                }
                return $len;
            },
            CURLOPT_TIMEOUT => 20,
            CURLOPT_PROTOCOLS => CURLPROTO_HTTP | CURLPROTO_HTTPS,
        ]);
        $body = (string) curl_exec($ch);
        $status = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $errno = curl_errno($ch);
        $err = $errno !== 0 ? curl_error($ch) : '';
        curl_close($ch);

        $retryAfter = null;
        if (isset($responseHeaders['retry-after'])) {
            $ra = $responseHeaders['retry-after'];
            if (ctype_digit($ra)) {
                $retryAfter = max(1, (int) $ra);
            } else {
                $ts = strtotime($ra);
                if ($ts !== false) {
                    $retryAfter = max(1, $ts - time());
                }
            }
        }

        // 200 OK / 202 Accepted are success for IndexNow.
        $ok = $errno === 0 && ($status === 200 || $status === 202);
        return [
            'ok' => $ok,
            'status' => $status,
            'body' => mb_substr($body, 0, 2000),
            'error' => $err !== '' ? $err : null,
            'retry_after' => $retryAfter,
        ];
    }

    private function isSafeEndpoint(string $url): bool
    {
        if (!filter_var($url, FILTER_VALIDATE_URL) || !preg_match('#^https?://#i', $url)) {
            return false;
        }
        $host = strtolower((string) (parse_url($url, PHP_URL_HOST) ?? ''));
        if ($host === '' || in_array($host, ['localhost', '127.0.0.1', '::1'], true)) {
            return false;
        }
        if (filter_var($host, FILTER_VALIDATE_IP)) {
            return (bool) filter_var($host, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE);
        }
        return true;
    }
}
