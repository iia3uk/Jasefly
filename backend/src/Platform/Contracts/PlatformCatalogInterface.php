<?php
declare(strict_types=1);

namespace App\Platform\Contracts;

/**
 * Product inventory facade. The catalog package owns product lookup and stock.
 */
interface PlatformCatalogInterface
{
    public function isAvailable(): bool;

    /** @return list<array<string,mixed>> */
    public function listPurchasable(): array;

    /** @return array<string,mixed>|null */
    public function findProductById(int $id): ?array;

    /** @return array<string,mixed>|null */
    public function findProductBySku(string $sku): ?array;

    public function decrementStock(int $productId, int $quantity = 1): bool;

    /**
     * @param callable():list<array<string,mixed>> $listPurchasable
     * @param callable(int):?array $findById
     * @param callable(string):?array $findBySku
     * @param callable(int,int):bool $decrementStock
     */
    public function registerBackend(callable $listPurchasable, callable $findById, callable $findBySku, callable $decrementStock): void;
}
