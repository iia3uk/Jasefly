<?php
declare(strict_types=1);

namespace App\Platform\Adapters;

use App\Platform\Contracts\PlatformOrdersInterface;

final class OrdersAdapter implements PlatformOrdersInterface
{
    private static ?string $ownerSlug = null;
    private static $createImpl = null;
    private static $transitionImpl = null;

    public function __construct(private string $moduleSlug = '') {}

    public function isAvailable(): bool
    {
        return self::$createImpl !== null && self::$transitionImpl !== null;
    }

    public function createFromCheckout(array $input): array
    {
        if (self::$createImpl === null) {
            throw new \RuntimeException('Orders service is unavailable');
        }
        return (self::$createImpl)($input);
    }

    public function transitionStatus(int $orderId, string $status, ?int $actorId = null, ?string $note = null): array
    {
        if (self::$transitionImpl === null) {
            throw new \RuntimeException('Orders service is unavailable');
        }
        return (self::$transitionImpl)($orderId, $status, $actorId, $note);
    }

    public function registerBackend(callable $createFromCheckout, callable $transitionStatus): void
    {
        $slug = trim($this->moduleSlug);
        if ($slug === '') {
            throw new \RuntimeException('orders.registerBackend requires a package slug context');
        }
        self::$ownerSlug = $slug;
        self::$createImpl = $createFromCheckout;
        self::$transitionImpl = $transitionStatus;
    }

    public static function clearOwner(string $slug): void
    {
        if (trim($slug) !== '' && self::$ownerSlug === trim($slug)) {
            self::$ownerSlug = null;
            self::$createImpl = self::$transitionImpl = null;
        }
    }
}
