<?php
declare(strict_types=1);

namespace App\Platform\Adapters;

use App\Database;
use App\Platform\Contracts\PlatformCatalogInterface;
use App\Services\SoftDeleteService;

/**
 * Soft catalog facade. The host performs read-only transition lookups until the
 * products package registers its inventory backend.
 */
final class CatalogAdapter implements PlatformCatalogInterface
{
    private static ?string $ownerSlug = null;
    private static $findByIdImpl = null;
    private static $listPurchasableImpl = null;
    private static $findBySkuImpl = null;
    private static $decrementStockImpl = null;

    public function __construct(private ?Database $db = null, private string $moduleSlug = '') {}

    public function isAvailable(): bool
    {
        return self::$findByIdImpl !== null || $this->db !== null;
    }

    public function listPurchasable(): array
    {
        if (self::$listPurchasableImpl !== null) {
            return (self::$listPurchasableImpl)();
        }
        if ($this->db === null) {
            return [];
        }
        try {
            $notDeleted = (new SoftDeleteService($this->db))->notDeletedClause('products');
            return $this->db->all("SELECT * FROM products WHERE is_visible=1 AND price > 0 AND {$notDeleted} ORDER BY sort_order, id");
        } catch (\Throwable) {
            return [];
        }
    }

    public function findProductById(int $id): ?array
    {
        if (self::$findByIdImpl !== null) {
            return (self::$findByIdImpl)($id);
        }
        return $this->hostFind('id=?', [$id]);
    }

    public function findProductBySku(string $sku): ?array
    {
        if (self::$findBySkuImpl !== null) {
            return (self::$findBySkuImpl)($sku);
        }
        return $this->hostFind('sku=?', [trim($sku)]);
    }

    public function decrementStock(int $productId, int $quantity = 1): bool
    {
        if (self::$decrementStockImpl === null) {
            return false;
        }
        return (self::$decrementStockImpl)($productId, max(1, $quantity));
    }

    public function registerBackend(callable $listPurchasable, callable $findById, callable $findBySku, callable $decrementStock): void
    {
        $slug = trim($this->moduleSlug);
        if ($slug === '') {
            throw new \RuntimeException('catalog.registerBackend requires a package slug context');
        }
        self::$ownerSlug = $slug;
        self::$listPurchasableImpl = $listPurchasable;
        self::$findByIdImpl = $findById;
        self::$findBySkuImpl = $findBySku;
        self::$decrementStockImpl = $decrementStock;
    }

    public static function clearOwner(string $slug): void
    {
        if (trim($slug) !== '' && self::$ownerSlug === trim($slug)) {
            self::$ownerSlug = null;
            self::$listPurchasableImpl = self::$findByIdImpl = self::$findBySkuImpl = self::$decrementStockImpl = null;
        }
    }

    /** @param list<mixed> $params @return array<string,mixed>|null */
    private function hostFind(string $where, array $params): ?array
    {
        if ($this->db === null) {
            return null;
        }
        try {
            $notDeleted = (new SoftDeleteService($this->db))->notDeletedClause('products');
            return $this->db->one(
                "SELECT * FROM products WHERE {$where} AND is_visible=1 AND is_purchasable=1 AND {$notDeleted}",
                $params,
            ) ?: null;
        } catch (\Throwable) {
            return null;
        }
    }
}
