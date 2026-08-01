<?php
declare(strict_types=1);

namespace App\PackageModules\Wallet;

use App\Platform\Contracts\PlatformRequestInterface;
use App\Platform\Package\AbstractPackageModule;
use App\Platform\Package\PlatformResponse;
use App\Platform\PlatformContext;

final class WalletModule extends AbstractPackageModule
{
    public function name(): string
    {
        return 'wallet';
    }

    public function label(): string
    {
        return 'Кошелёк';
    }

    public function priority(): int
    {
        return 57;
    }

    public function adminNav(): array
    {
        return [
            [
                'group' => 'Коммерция',
                'path' => '/admin/wallet',
                'label' => 'Кошелёк',
                'permission' => 'wallet.view',
                'icon' => 'wallet',
            ],
        ];
    }

    public function bootPlatform(PlatformContext $ctx): void
    {
        parent::bootPlatform($ctx);

        $ctx->capabilities()->require('access.service');
        $ctx->access()->registerProvider(new WalletAccessProvider($ctx->database()));

        $http = $ctx->http();
        $perms = $ctx->permissions();
        $db = $ctx->database();
        $protected = [$http->authMiddleware(), $http->permissionMiddleware()];

        $http->get('/admin/wallet', static function (PlatformRequestInterface $r) use ($perms, $db) {
            $perms->require($r->user() ?? [], 'wallet.view');
            try {
                $rows = $db->all(
                    'SELECT user_id, currency, balance FROM wallet_balances ORDER BY user_id ASC LIMIT 100'
                );
            } catch (\Throwable) {
                $rows = [];
            }
            PlatformResponse::json(['data' => ['balances' => $rows, 'scaffold' => true]]);
        }, $protected);
    }
}
