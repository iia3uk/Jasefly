<?php
declare(strict_types=1);

namespace App\Platform\Contracts;

interface PlatformDatabaseInterface
{
    /** @param list<mixed> $params @return list<array<string, mixed>> */
    public function all(string $sql, array $params = []): array;

    /** @param list<mixed> $params @return array<string, mixed>|null */
    public function one(string $sql, array $params = []): ?array;

    /** @param list<mixed> $params */
    public function run(string $sql, array $params = []): void;

    public function lastInsertId(): int;
}
