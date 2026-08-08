<?php
declare(strict_types=1);

namespace App;

final class Response
{
    public static function json(mixed $data, int $status = 200, array $meta = []): never
    {
        http_response_code($status);
        header('Content-Type: application/json; charset=utf-8');
        // API JSON is user-specific; never allow shared/proxy HTML-shell TTL to stick.
        header('Cache-Control: private, no-store, no-cache, must-revalidate');
        header('Pragma: no-cache');

        if (is_array($data) && (array_key_exists('data', $data) || array_key_exists('error', $data))) {
            $payload = $data;
        } else {
            $payload = [
                'success' => $status >= 200 && $status < 300,
                'data' => $data,
            ];
        }

        // Always expose api_version (even when caller passed a custom meta bag).
        $baseMeta = ['api_version' => 'v1'];
        if (!isset($payload['meta']) || !is_array($payload['meta'])) {
            $payload['meta'] = array_merge($baseMeta, $meta);
        } else {
            $payload['meta'] = array_merge($baseMeta, $payload['meta'], $meta);
        }

        $flags = JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE;
        if (defined('JSON_INVALID_UTF8_SUBSTITUTE')) {
            $flags |= JSON_INVALID_UTF8_SUBSTITUTE;
        }
        $encoded = json_encode($payload, $flags);
        if ($encoded === false) {
            // Never echo bare `false` (empty body / silent SPA break). Common on
            // /admin/plugins when a module setting has invalid UTF-8 or INF/NAN.
            @error_log('Response::json encode failed: ' . json_last_error_msg());
            $encoded = json_encode([
                'success' => false,
                'error' => 'JSON encode failed: ' . json_last_error_msg(),
                'errors' => [],
                'data' => null,
                'meta' => $baseMeta,
            ], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) ?: '{"success":false,"error":"JSON encode failed","data":null}';
            http_response_code(500);
        }
        echo $encoded;
        exit;
    }

    public static function error(string $message, int $status = 400, array $errors = [], array $extra = []): never
    {
        self::json(array_merge([
            'success' => false,
            'error' => $message,
            'errors' => $errors,
            'data' => null,
        ], $extra), $status);
    }

    /** Plain-text response (Robokassa OK{InvId}, Adyen [accepted], …). */
    public static function text(string $body, int $status = 200, string $contentType = 'text/plain; charset=utf-8'): never
    {
        http_response_code($status);
        header('Content-Type: ' . $contentType);
        echo $body;
        exit;
    }
}
