<?php
declare(strict_types=1);

namespace App\Controllers;

use App\Request;
use App\Response;
use App\Services\PermissionService;
use App\Services\SystemHealthService;

final class SystemController
{
    public function __construct(
        private SystemHealthService $health,
        private PermissionService $permissions
    ) {}

    public function status(Request $r): never
    {
        $this->permissions->require($r->user ?? [], 'system.manage');
        Response::json(['data' => $this->health->status()]);
    }

    public function roles(Request $r): never
    {
        Response::json(['data' => $this->permissions->roles()]);
    }

    public function permissions(Request $r): never
    {
        Response::json(['data' => $this->permissions->permissions()]);
    }
}
