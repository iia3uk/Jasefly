<?php
declare(strict_types=1);

namespace App\PackageModules\Maps;

use App\Platform\Contracts\PlatformRequestInterface;
use App\Platform\Package\AbstractPackageModule;
use App\Platform\Package\PlatformResponse;
use App\Platform\PlatformContext;

final class MapsModule extends AbstractPackageModule
{
    public function name(): string
    {
        return 'maps';
    }

    public function label(): string
    {
        return 'Maps';
    }

    public function priority(): int
    {
        return 70;
    }

    public function adminNav(): array
    {
        return [[
            'group' => 'Контент',
            'path' => '/admin/maps',
            'label' => 'Карты',
            'permission' => 'maps.view',
            'icon' => 'map',
        ]];
    }

    public function bootPlatform(PlatformContext $ctx): void
    {
        parent::bootPlatform($ctx);

        $ctx->capabilities()->require('api.routes');
        $ctx->capabilities()->require('settings.module');

        $ctx->access()->registerCapability([
            'slug' => 'maps.view',
            'label' => 'Maps — просмотр',
            'group' => 'modules',
            'risk' => 'low',
            'scope_default' => 'site',
            'default_roles' => ['admin', 'editor', 'super_admin'],
            'source' => 'maps',
        ]);
        $ctx->access()->registerCapability([
            'slug' => 'maps.manage',
            'label' => 'Maps — настройки',
            'group' => 'modules',
            'risk' => 'low',
            'scope_default' => 'site',
            'default_roles' => ['admin', 'super_admin'],
            'source' => 'maps',
        ]);
        $ctx->access()->registerAdminNavItem([
            'group' => 'Контент',
            'path' => '/admin/maps',
            'label' => 'Карты',
            'capability' => 'maps.view',
            'icon' => 'map',
        ]);

        $svc = static fn(): MapsService => new MapsService($ctx->database());

        $http = $ctx->http();
        $perms = $ctx->permissions();
        $protected = [$http->authMiddleware(), $http->permissionMiddleware()];

        $http->get('/maps/config', static function () use ($svc) {
            PlatformResponse::json(['data' => $svc()->publicConfig()]);
        });

        $http->get('/admin/maps/ping', static function (PlatformRequestInterface $r) use ($perms, $svc) {
            $perms->require($r->user() ?? [], 'maps.view');
            PlatformResponse::json(['data' => $svc()->ping()]);
        }, $protected);

        $http->get('/admin/maps/settings', static function (PlatformRequestInterface $r) use ($perms, $svc) {
            $perms->require($r->user() ?? [], 'maps.view');
            PlatformResponse::json(['data' => $svc()->getSettings()]);
        }, $protected);

        $http->put('/admin/maps/settings', static function (PlatformRequestInterface $r) use ($perms, $svc) {
            $perms->require($r->user() ?? [], 'maps.manage');
            $body = $r->body();
            if (!is_array($body)) {
                PlatformResponse::error('Invalid body', 422);
            }
            try {
                $saved = $svc()->saveSettings($body);
            } catch (\Throwable $e) {
                PlatformResponse::error($e->getMessage(), 422);
            }
            PlatformResponse::json(['data' => $saved, 'message' => 'Сохранено']);
        }, $protected);
    }
}
