<?php
declare(strict_types=1);

namespace App\Platform\Contracts;

interface PlatformUsersInterface
{
    /** @return array<string, mixed>|null */
    public function findById(int $id): ?array;

    /** @return array<string, mixed>|null */
    public function findByEmail(string $email): ?array;

    /** @return list<string> */
    public function rolesFor(int $userId): array;
}
