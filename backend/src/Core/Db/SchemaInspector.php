<?php
declare(strict_types=1);

namespace App\Core\Db;

use App\Database;

/**
 * Driver-agnostic schema introspection — replaces scattered
 * information_schema / SHOW COLUMNS / SHOW TABLES queries.
 */
interface SchemaInspector
{
    public function tableExists(string $table): bool;

    public function columnExists(string $table, string $column): bool;

    /**
     * @return array<string, array{name:string, type:string, nullable:bool}>
     */
    public function columns(string $table): array;

    /** @return array<string, true> index name => true */
    public function indexes(string $table): array;

    /** @return list<string> */
    public function listTables(): array;

    public function foreignKeyChecks(bool $on): void;
}
