<?php
declare(strict_types=1);

namespace App\Platform\Contracts;

interface PlatformCapabilitiesInterface
{
    public function has(string $capability): bool;

    public function require(string $capability): void;

    public function resolveProvider(string $capability): ?string;

    /** @return list<string> */
    public function list(): array;
}
