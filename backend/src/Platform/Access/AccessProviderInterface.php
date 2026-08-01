<?php
declare(strict_types=1);

namespace App\Platform\Access;

interface AccessProviderInterface
{
    public function id(): string;

    public function label(): string;

    /**
     * Assert catalog for the inspector.
     *
     * @return list<array{id: string, label: string, params?: list<array<string, mixed>>}>
     */
    public function asserts(): array;

    public function isAvailable(): bool;

    /**
     * @param array<string, mixed> $params
     */
    public function evaluate(?int $userId, string $assert, array $params = []): AccessDecision;
}
