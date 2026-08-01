<?php
declare(strict_types=1);

namespace App\Platform\Contracts;

use App\Platform\Access\AccessDecision;
use App\Platform\Access\AccessProviderInterface;
use App\Platform\Access\Acl\AccessContext;

/**
 * Universal access control — Builder, public render, and Admin ACL.
 * ZIP modules register providers/capabilities via this contract.
 */
interface PlatformAccessInterface
{
    /**
     * @param array<string, mixed>|null $rule Access rule DSL
     */
    public function can(?int $userId, ?array $rule): AccessDecision;

    public function canCapability(AccessContext $ctx): AccessDecision;

    /** @param list<string> $capabilities @return array<string, bool> */
    public function batchCan(?int $userId, array $capabilities): array;

    /** @return array<string, mixed> */
    public function explain(?int $userId, string $capability): array;

    /** @return list<string> */
    public function effectiveCapabilities(?int $userId): array;

    /** @return array{caps: list<string>, is_super: bool, roles: list<string>, version: string} */
    public function effectiveBundle(?int $userId): array;

    /** @param array<string, mixed> $def */
    public function registerCapability(array $def): void;

    /** @param array<string, mixed> $item */
    public function registerAdminNavItem(array $item): void;

    /** @return list<array<string, mixed>> */
    public function capabilityCatalog(): array;

    public function registerProvider(AccessProviderInterface $provider): void;

    /** @return list<array<string, mixed>> */
    public function providers(): array;

    /**
     * @param array<string, mixed>|null $layout
     * @return array<string, mixed>|null
     */
    public function filterLayout(?array $layout, ?int $userId, bool $staffBypass = false): ?array;
}
