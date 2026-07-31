<?php
declare(strict_types=1);

namespace App\Services\Modules;

use App\Core\Modules\ModulePackagePaths;

/**
 * Persists modules that failed boot so the next request skips them until cleared.
 *
 * Entry shape (per slug):
 * class, error, file, line, stage, at
 */
final class ModuleSafeMode
{
    public function __construct(private ModulePackagePaths $paths) {}

    /**
     * @return array<string, array{error:string, at:string, reason?:string, class?:string, file?:?string, line?:?int, stage?:string}>
     */
    public function read(): array
    {
        $path = $this->paths->safeModeFile();
        if (!is_file($path)) {
            return [];
        }
        $raw = file_get_contents($path);
        $data = is_string($raw) ? json_decode($raw, true) : null;
        if (!is_array($data)) {
            return [];
        }
        $out = [];
        foreach ($data as $slug => $entry) {
            if (!is_string($slug) || !is_array($entry)) {
                continue;
            }
            $error = (string) ($entry['error'] ?? '');
            if ($error === '') {
                continue;
            }
            $out[$slug] = [
                'error' => $error,
                'at' => (string) ($entry['at'] ?? ''),
                'reason' => (string) ($entry['reason'] ?? ''),
                'class' => (string) ($entry['class'] ?? ''),
                'file' => isset($entry['file']) && is_string($entry['file']) ? $entry['file'] : null,
                'line' => isset($entry['line']) ? (int) $entry['line'] : null,
                'stage' => (string) ($entry['stage'] ?? ''),
            ];
        }
        return $out;
    }

    /**
     * @return array{error:string, at:string, reason?:string, class?:string, file?:?string, line?:?int, stage?:string}|null
     */
    public function entry(string $slug): ?array
    {
        return $this->read()[$slug] ?? null;
    }

    public function isSkipped(string $slug): bool
    {
        return isset($this->read()[$slug]);
    }

    /**
     * @param string|array{error?:string, reason?:string, class?:string, file?:?string, line?:?int, stage?:string, at?:string} $detail
     */
    public function markFailed(string $slug, string|array $detail): void
    {
        $data = $this->read();
        if (is_string($detail)) {
            $trimmed = trim($detail);
            $data[$slug] = [
                'error' => function_exists('mb_substr')
                    ? mb_substr($trimmed, 0, 2000)
                    : substr($trimmed, 0, 2000),
                'reason' => ModuleQuarantineReason::EXCEPTION,
                'class' => '',
                'file' => null,
                'line' => null,
                'stage' => '',
                'at' => gmdate(DATE_ATOM),
            ];
        } else {
            $error = trim((string) ($detail['error'] ?? ''));
            $data[$slug] = [
                'error' => function_exists('mb_substr')
                    ? mb_substr($error, 0, 2000)
                    : substr($error, 0, 2000),
                'reason' => (string) ($detail['reason'] ?? ModuleQuarantineReason::EXCEPTION),
                'class' => (string) ($detail['class'] ?? ''),
                'file' => isset($detail['file']) && is_string($detail['file']) ? $detail['file'] : null,
                'line' => isset($detail['line']) ? (int) $detail['line'] : null,
                'stage' => (string) ($detail['stage'] ?? ''),
                'at' => (string) ($detail['at'] ?? gmdate(DATE_ATOM)),
            ];
        }
        $this->write($data);
    }

    public function clear(string $slug): void
    {
        $data = $this->read();
        unset($data[$slug]);
        $this->write($data);
    }

    /** @param array<string, array<string, mixed>> $data */
    private function write(array $data): void
    {
        $path = $this->paths->safeModeFile();
        $dir = dirname($path);
        if (!is_dir($dir)) {
            @mkdir($dir, 0775, true);
        }
        if ($data === []) {
            if (is_file($path)) {
                @unlink($path);
            }
            return;
        }
        $json = json_encode($data, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
        if ($json === false) {
            throw new \RuntimeException('Cannot encode safe-mode state');
        }
        if (@file_put_contents($path, $json . "\n", LOCK_EX) === false) {
            throw new \RuntimeException('Cannot write safe-mode state');
        }
    }
}
