<?php
declare(strict_types=1);

namespace App\Platform\Contracts;

/**
 * Host-owned authentication lifecycle. Packages may add login gates and finish
 * a session they initiated, but never access passwords or JWT internals.
 */
interface PlatformAuthInterface
{
    /** @param callable(array<string,mixed>):?string $gate */
    public function registerLoginGate(callable $gate): void;

    public function clearOwner(): void;

    /**
     * Emits the normal host session response for a newly-created or verified user.
     * @param array<string,mixed> $user
     * @param array<string,mixed> $extraPayload
     */
    public function completeLogin(PlatformRequestInterface $request, array $user, array $extraPayload = []): never;
}
