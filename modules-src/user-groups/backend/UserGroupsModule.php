<?php
declare(strict_types=1);

namespace App\PackageModules\UserGroups;

use App\Platform\Contracts\PlatformRequestInterface;
use App\Platform\Package\AbstractPackageModule;
use App\Platform\Package\PlatformResponse;
use App\Platform\PlatformContext;

final class UserGroupsModule extends AbstractPackageModule
{
    public function name(): string
    {
        return 'user-groups';
    }

    public function label(): string
    {
        return 'Группы пользователей';
    }

    public function priority(): int
    {
        return 55;
    }

    public function adminNav(): array
    {
        return [
            [
                'group' => 'Пользователи',
                'path' => '/admin/user-groups',
                'label' => 'Группы',
                'permission' => 'user-groups.view',
                'icon' => 'users',
            ],
        ];
    }

    public function bootPlatform(PlatformContext $ctx): void
    {
        parent::bootPlatform($ctx);

        $ctx->capabilities()->require('access.service');
        $ctx->access()->registerProvider(new GroupAccessProvider($ctx->database()));

        $http = $ctx->http();
        $perms = $ctx->permissions();
        $db = $ctx->database();
        $protected = [$http->authMiddleware(), $http->permissionMiddleware()];

        $http->get('/admin/user-groups', static function (PlatformRequestInterface $r) use ($perms, $db) {
            $perms->require($r->user() ?? [], 'user-groups.view');
            try {
                $groups = $db->all('SELECT id, name, slug, created_at FROM ug_groups ORDER BY id ASC LIMIT 200');
            } catch (\Throwable) {
                $groups = [];
            }
            PlatformResponse::json(['data' => ['groups' => $groups, 'scaffold' => true]]);
        }, $protected);
    }
}
