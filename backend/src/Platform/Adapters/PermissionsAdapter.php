<?php
declare(strict_types=1);

namespace App\Platform\Adapters;

use App\Database;
use App\Platform\Contracts\PlatformPermissionsInterface;
use App\Services\PermissionService;

final class PermissionsAdapter implements PlatformPermissionsInterface
{
    private PermissionService $perms;

    public function __construct(Database $db)
    {
        $this->perms = new PermissionService($db);
    }

    public function can(array $user, string $permission): bool
    {
        return $this->perms->can($user, $permission);
    }

    public function require(array $user, string $permission): void
    {
        $this->perms->require($user, $permission);
    }
}
