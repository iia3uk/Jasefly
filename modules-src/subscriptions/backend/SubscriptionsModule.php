<?php
declare(strict_types=1);

namespace App\PackageModules\Subscriptions;

use App\Platform\Contracts\PlatformRequestInterface;
use App\Platform\Package\AbstractPackageModule;
use App\Platform\Package\PlatformResponse;
use App\Platform\PlatformContext;

final class SubscriptionsModule extends AbstractPackageModule
{
    public function name(): string
    {
        return 'subscriptions';
    }

    public function label(): string
    {
        return 'Подписки';
    }

    public function priority(): int
    {
        return 56;
    }

    public function adminNav(): array
    {
        return [
            [
                'group' => 'Коммерция',
                'path' => '/admin/subscriptions',
                'label' => 'Подписки',
                'permission' => 'subscriptions.view',
                'icon' => 'credit-card',
            ],
        ];
    }

    public function bootPlatform(PlatformContext $ctx): void
    {
        parent::bootPlatform($ctx);

        $ctx->capabilities()->require('access.service');
        $ctx->access()->registerProvider(new SubscriptionAccessProvider($ctx->database()));

        $http = $ctx->http();
        $perms = $ctx->permissions();
        $db = $ctx->database();
        $protected = [$http->authMiddleware(), $http->permissionMiddleware()];

        $http->get('/admin/subscriptions', static function (PlatformRequestInterface $r) use ($perms, $db) {
            $perms->require($r->user() ?? [], 'subscriptions.view');
            try {
                $plans = $db->all('SELECT id, code, name, status FROM sub_plans ORDER BY id ASC LIMIT 100');
            } catch (\Throwable) {
                $plans = [];
            }
            PlatformResponse::json(['data' => ['plans' => $plans, 'scaffold' => true]]);
        }, $protected);
    }
}
