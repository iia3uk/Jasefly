<?php
declare(strict_types=1);

namespace App\Services;

/**
 * Persists the last API exception for the admin debugger UI.
 */
final class ErrorReportService
{
    public static function storageFile(): string
    {
        $dir = dirname(__DIR__, 2) . '/storage/logs';
        if (!is_dir($dir)) {
            @mkdir($dir, 0755, true);
        }
        return $dir . '/last-error.json';
    }

    /** @param array<string, mixed> $report */
    public static function store(array $report): void
    {
        @file_put_contents(
            self::storageFile(),
            json_encode($report, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PARTIAL_OUTPUT_ON_ERROR),
        );
    }

    /** @return array<string, mixed>|null */
    public static function last(): ?array
    {
        $file = self::storageFile();
        if (!is_file($file)) {
            return null;
        }
        $raw = (string) @file_get_contents($file);
        if ($raw === '') {
            return null;
        }
        $decoded = json_decode($raw, true);
        return is_array($decoded) ? $decoded : null;
    }

    public static function clear(): bool
    {
        $file = self::storageFile();
        if (!is_file($file)) {
            return true;
        }
        return @unlink($file);
    }

    public static function fromThrowable(\Throwable $e, ?array $request = null): array
    {
        $prev = $e->getPrevious();
        return [
            'at' => gmdate('c'),
            'message' => $e->getMessage(),
            'type' => $e::class,
            'file' => $e->getFile(),
            'line' => $e->getLine(),
            'code' => $e->getCode(),
            'trace' => self::formatTrace($e),
            'previous' => $prev ? [
                'message' => $prev->getMessage(),
                'type' => $prev::class,
                'file' => $prev->getFile(),
                'line' => $prev->getLine(),
            ] : null,
            'request' => $request,
            'php' => PHP_VERSION,
        ];
    }

    /** @return list<array{file:?string,line:?int,fn:string}> */
    private static function formatTrace(\Throwable $e): array
    {
        $out = [];
        foreach ($e->getTrace() as $i => $frame) {
            if ($i >= 40) {
                break;
            }
            $fn = ($frame['class'] ?? '') . ($frame['type'] ?? '') . ($frame['function'] ?? '');
            $out[] = [
                'file' => isset($frame['file']) ? (string) $frame['file'] : null,
                'line' => isset($frame['line']) ? (int) $frame['line'] : null,
                'fn' => $fn !== '' ? $fn : '{main}',
            ];
        }
        return $out;
    }

    /**
     * Show full debug payload to admins / local / explicit debug flag.
     * Public anonymous traffic still gets a generic message.
     */
    public static function shouldExposeDetails(): bool
    {
        if (isset($_GET['debug']) && (string) $_GET['debug'] === '1') {
            return true;
        }
        $qs = (string) ($_SERVER['QUERY_STRING'] ?? '');
        if (preg_match('/(?:^|&)debug=1(?:&|$)/', $qs)) {
            return true;
        }
        if (is_file(dirname(__DIR__, 2) . '/storage/.show_errors')) {
            return true;
        }
        $env = strtolower((string) (getenv('APP_ENV') ?: ''));
        if (in_array($env, ['local', 'development', 'dev'], true)) {
            return true;
        }
        // Admin API calls always get details (Bearer present or /admin path).
        $auth = (string) ($_SERVER['HTTP_AUTHORIZATION'] ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '');
        if ($auth !== '' && preg_match('/^Bearer\s+\S+/i', $auth)) {
            return true;
        }
        $uri = (string) ($_SERVER['REQUEST_URI'] ?? '');
        if (str_contains($uri, '/admin/')) {
            return true;
        }
        return false;
    }

    /** @return array<string, mixed> */
    public static function captureRequest(): array
    {
        return [
            'method' => (string) ($_SERVER['REQUEST_METHOD'] ?? 'GET'),
            'uri' => (string) ($_SERVER['REQUEST_URI'] ?? ''),
            'query' => (string) ($_SERVER['QUERY_STRING'] ?? ''),
            'ip' => (string) ($_SERVER['REMOTE_ADDR'] ?? ''),
            'ua' => substr((string) ($_SERVER['HTTP_USER_AGENT'] ?? ''), 0, 200),
        ];
    }
}
