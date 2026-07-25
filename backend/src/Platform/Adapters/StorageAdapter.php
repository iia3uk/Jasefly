<?php
declare(strict_types=1);

namespace App\Platform\Adapters;

use App\Core\Modules\ModulePackagePaths;
use App\Platform\Contracts\PlatformStorageInterface;

final class StorageAdapter implements PlatformStorageInterface
{
    public function __construct(
        private ModulePackagePaths $paths,
        private string $slug,
    ) {}

    private function abs(string $relativePath): string
    {
        $rel = ltrim(str_replace('\\', '/', $relativePath), '/');
        if ($rel === '' || str_contains($rel, '..')) {
            throw new \InvalidArgumentException('Invalid storage path');
        }
        $root = $this->paths->moduleStorage($this->slug);
        if (!is_dir($root)) {
            @mkdir($root, 0775, true);
        }
        $abs = $root . '/' . $rel;
        $this->paths->assertContained($root, dirname($abs));
        return $abs;
    }

    public function put(string $relativePath, string $contents): void
    {
        $abs = $this->abs($relativePath);
        $parent = dirname($abs);
        if (!is_dir($parent)) {
            @mkdir($parent, 0775, true);
        }
        if (@file_put_contents($abs, $contents) === false) {
            throw new \RuntimeException('Storage write failed');
        }
    }

    public function get(string $relativePath): ?string
    {
        $abs = $this->abs($relativePath);
        if (!is_file($abs)) {
            return null;
        }
        $raw = file_get_contents($abs);
        return is_string($raw) ? $raw : null;
    }

    public function exists(string $relativePath): bool
    {
        return is_file($this->abs($relativePath));
    }

    public function delete(string $relativePath): bool
    {
        $abs = $this->abs($relativePath);
        return is_file($abs) ? @unlink($abs) : false;
    }

    public function list(string $relativeDir = ''): array
    {
        $rel = ltrim(str_replace('\\', '/', $relativeDir), '/');
        $root = $this->paths->moduleStorage($this->slug);
        $dir = $rel === '' ? $root : $root . '/' . $rel;
        if (!is_dir($dir)) {
            return [];
        }
        $out = [];
        $it = new \RecursiveIteratorIterator(new \RecursiveDirectoryIterator($dir, \FilesystemIterator::SKIP_DOTS));
        foreach ($it as $file) {
            if (!$file->isFile()) {
                continue;
            }
            $full = str_replace('\\', '/', $file->getPathname());
            $base = str_replace('\\', '/', $root);
            $out[] = ltrim(substr($full, strlen($base)), '/');
        }
        sort($out);
        return $out;
    }

    public function publicUrl(string $relativePath): ?string
    {
        $rel = ltrim(str_replace('\\', '/', $relativePath), '/');
        if ($rel === '' || str_contains($rel, '..')) {
            return null;
        }
        return '/modules/' . $this->slug . '/' . $rel;
    }
}
