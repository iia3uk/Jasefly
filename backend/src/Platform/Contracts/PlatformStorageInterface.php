<?php
declare(strict_types=1);

namespace App\Platform\Contracts;

/**
 * Module-scoped storage — no real filesystem paths exposed to packages.
 */
interface PlatformStorageInterface
{
    public function put(string $relativePath, string $contents): void;

    public function get(string $relativePath): ?string;

    public function exists(string $relativePath): bool;

    public function delete(string $relativePath): bool;

    /** @return list<string> */
    public function list(string $relativeDir = ''): array;

    /** Public URL under /modules/{slug}/… when applicable. */
    public function publicUrl(string $relativePath): ?string;
}
