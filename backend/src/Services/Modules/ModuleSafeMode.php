<?php
declare(strict_types=1);

namespace App\Services\Modules;

use App\Core\Modules\ModulePackagePaths;

/**
 * Persists modules that failed boot so the next request skips them until cleared.
 */
final class ModuleSafeMode
{
    public function __construct(private ModulePackagePaths $paths) {}

    /** @return array<string, array{error:string, at:string}> */
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
            ];
        }
        return $out;
    }

    public function isSkipped(string $slug): bool
    {
        return isset($this->read()[$slug]);
    }

    public function markFailed(string $slug, string $error): void
    {
        $data = $this->read();
        $trimmed = trim($error);
        $data[$slug] = [
            'error' => function_exists('mb_substr')
                ? mb_substr($trimmed, 0, 2000)
                : substr($trimmed, 0, 2000),
            'at' => gmdate(DATE_ATOM),
        ];
        $this->write($data);
    }

    public function clear(string $slug): void
    {
        $data = $this->read();
        unset($data[$slug]);
        $this->write($data);
    }

    /** @param array<string, array{error:string, at:string}> $data */
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
