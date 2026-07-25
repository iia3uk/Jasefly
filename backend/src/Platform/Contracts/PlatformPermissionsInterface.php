<?php
declare(strict_types=1);

namespace App\Platform\Contracts;

interface PlatformPermissionsInterface
{
    /** @param array<string, mixed> $user */
    public function can(array $user, string $permission): bool;

    /** @param array<string, mixed> $user */
    public function require(array $user, string $permission): void;
}
