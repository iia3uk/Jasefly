<?php
declare(strict_types=1);

namespace App\Platform\Manifest;

/**
 * Public immutable view of a package module.json for Platform SDK consumers.
 * Never exposes App\Core\* types.
 */
interface PlatformModuleManifestInterface
{
    public function slug(): string;

    public function name(): string;

    public function version(): string;

    public function description(): string;

    public function sdkVersion(): int;

    public function apiVersion(): int;

    /** @return list<string> */
    public function requiredCapabilities(): array;

    /** @return list<string> */
    public function providedCapabilities(): array;

    /** @return list<string> */
    public function permissions(): array;

    public function backendEntrypoint(): string;

    public function frontendManifestPath(): ?string;

    /** @return array<string, mixed> Public subset only */
    public function toPublicArray(): array;
}
