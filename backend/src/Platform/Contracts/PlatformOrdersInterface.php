<?php
declare(strict_types=1);

namespace App\Platform\Contracts;

/**
 * Checkout/order lifecycle facade owned by the Orders package.
 */
interface PlatformOrdersInterface
{
    public function isAvailable(): bool;

    /** @param array<string,mixed> $input @return array<string,mixed> */
    public function createFromCheckout(array $input): array;

    /** @return array<string,mixed> */
    public function transitionStatus(int $orderId, string $status, ?int $actorId = null, ?string $note = null): array;

    /**
     * @param callable(array<string,mixed>):array<string,mixed> $createFromCheckout
     * @param callable(int,string,?int,?string):array<string,mixed> $transitionStatus
     */
    public function registerBackend(callable $createFromCheckout, callable $transitionStatus): void;
}
