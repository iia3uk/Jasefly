<?php
declare(strict_types=1);

namespace App\PackageModules\DemoKit;

use App\Platform\Contracts\PlatformRequestInterface;
use App\Platform\Package\AbstractPackageModule;
use App\Platform\Package\PlatformResponse;
use App\Platform\PlatformContext;

final class DemoKitModule extends AbstractPackageModule
{
    public function name(): string
    {
        return 'demo-kit';
    }

    public function label(): string
    {
        return 'Demo Kit';
    }

    public function priority(): int
    {
        return 200;
    }

    public function adminNav(): array
    {
        return [
            [
                'group' => 'Разработка',
                'path' => '/admin/demo-kit',
                'label' => 'Demo Kit',
                'permission' => 'demo-kit.view',
                'icon' => 'package',
            ],
        ];
    }

    public function bootPlatform(PlatformContext $ctx): void
    {
        parent::bootPlatform($ctx);

        $ctx->capabilities()->require('http.client');
        $ctx->access()->registerCapability([
            'slug' => 'demo-kit.view',
            'label' => 'Demo Kit',
            'group' => 'modules',
            'risk' => 'low',
            'scope_default' => 'site',
            'default_roles' => ['admin', 'editor', 'super_admin'],
            'source' => 'demo-kit',
        ]);
        $ctx->access()->registerAdminNavItem([
            'group' => 'Разработка',
            'path' => '/admin/demo-kit',
            'label' => 'Demo Kit',
            'capability' => 'demo-kit.view',
            'icon' => 'package',
        ]);
        $ctx->storage()->put('boot-marker.txt', 'booted-at=' . gmdate(DATE_ATOM));
        $ctx->events()->publish('demo-kit.booted', ['slug' => $ctx->slug()]);
        $ctx->logger()->info('Demo Kit platform boot', ['sdk' => $ctx->moduleSdkVersion()]);

        $http = $ctx->http();
        $perms = $ctx->permissions();
        $protected = [$http->authMiddleware(), $http->permissionMiddleware()];

        $http->get('/admin/demo-kit/ping', static function (PlatformRequestInterface $r) use ($perms) {
            $perms->require($r->user() ?? [], 'demo-kit.view');
            PlatformResponse::json(['data' => [
                'ok' => true,
                'module' => 'demo-kit',
                'message' => 'pong',
                'time' => gmdate(DATE_ATOM),
                'sdk' => 'platform',
            ]]);
        }, $protected);
    }
}
