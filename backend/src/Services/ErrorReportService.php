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
        $redactor = dirname(__DIR__) . '/Support/SecretRedactor.php';
        if (is_file($redactor)) {
            require_once $redactor;
            if (class_exists(\App\Support\SecretRedactor::class)) {
                $report = \App\Support\SecretRedactor::redact($report, \App\Support\SecretRedactor::DEMO_KEYS);
            }
        }
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
     * Expose stack/details only in non-production or via explicit ops flag.
     * Public anonymous traffic always gets a generic message in production.
     * Admins use authenticated GET /admin/system/last-error (stored separately).
     */
    public static function shouldExposeDetails(): bool
    {
        if (is_file(dirname(__DIR__, 2) . '/storage/.show_errors')) {
            return true;
        }
        $env = strtolower((string) (getenv('APP_ENV') ?: ($_ENV['APP_ENV'] ?? '')));
        return in_array($env, ['local', 'development', 'dev', 'test'], true);
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
