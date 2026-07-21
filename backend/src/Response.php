<?php
declare(strict_types=1);

namespace App;

final class Response
{
    public static function json(mixed $data, int $status = 200, array $meta = []): never
    {
        http_response_code($status);
        header('Content-Type: application/json; charset=utf-8');

        if (is_array($data) && (array_key_exists('data', $data) || array_key_exists('error', $data))) {
            $payload = $data;
        } else {
            $payload = [
                'success' => $status >= 200 && $status < 300,
                'data' => $data,
            ];
        }

        if (!isset($payload['meta'])) {
            $payload['meta'] = array_merge(['api_version' => 'v1'], $meta);
        }

        echo json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
        exit;
    }

    public static function error(string $message, int $status = 400, array $errors = []): never
    {
        self::json([
            'success' => false,
            'error' => $message,
            'errors' => $errors,
            'data' => null,
        ], $status);
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
