<?php
declare(strict_types=1);

namespace App\Platform\Contracts;

/**
 * Public request view for package HTTP handlers (no App\Request type leak).
 */
interface PlatformRequestInterface
{
    public function method(): string;

    public function path(): string;

    public function ip(): string;

    /** @return array<string, mixed> */
    public function query(): array;

    /** @return array<string, mixed> */
    public function body(): array;

    public function input(string $key, mixed $default = null): mixed;

    public function header(string $name, ?string $default = null): ?string;

    /** Authenticated user payload when present. @return array<string, mixed>|null */
    public function user(): ?array;

    public function raw(): mixed;
}
