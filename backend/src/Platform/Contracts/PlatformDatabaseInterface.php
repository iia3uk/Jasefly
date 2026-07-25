<?php
declare(strict_types=1);

namespace App\Platform\Contracts;

/**
 * Database access for package modules.
 *
 * Trust model: packages are trusted server-side PHP. This API provides
 * stable signatures and conventions (prefer module-prefixed tables),
 * not a malware sandbox. Arbitrary SQL is possible — do not treat as isolation.
 */
interface PlatformDatabaseInterface
{
    /** @param list<mixed> $params @return list<array<string, mixed>> */
    public function all(string $sql, array $params = []): array;

    /** @param list<mixed> $params @return array<string, mixed>|null */
    public function one(string $sql, array $params = []): ?array;

    /** @param list<mixed> $params */
    public function run(string $sql, array $params = []): void;

    public function lastInsertId(): int;

    /**
     * Run $callback inside a DB transaction. Rolls back on Throwable.
     *
     * @template T
     * @param callable(): T $callback
     * @return T
     */
    public function transaction(callable $callback): mixed;
}
