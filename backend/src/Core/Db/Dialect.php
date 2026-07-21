<?php
declare(strict_types=1);

namespace App\Core\Db;

/**
 * SQL dialect abstraction — emits driver-specific DDL/DML so the kernel and
 * plugins stay driver-agnostic. One implementation per supported driver.
 */
interface Dialect
{
    /** Driver machine name: mysql | sqlite | pgsql */
    public function name(): string;

    /** Quote an identifier (table/column/index name). */
    public function quoteIdent(string $ident): string;

    /** Map a blueprint column type to this driver's SQL type. */
    public function columnType(string $bpType): string;

    /** Whether this driver supports FULLTEXT indexes. */
    public function supportsFulltext(): bool;

    /** Whether this driver supports ON UPDATE CURRENT_TIMESTAMP natively. */
    public function supportsOnUpdateTimestamp(): bool;

    /**
     * Suffix appended to an INSERT statement to make it an upsert.
     *
     * @param list<string> $uniqueCols Conflict target columns.
     * @param list<string> $updateCols Columns to update on conflict.
     */
    public function upsertConflictClause(array $uniqueCols, array $updateCols): string;

    /** SQL to enable/disable foreign key checks for the current session. */
    public function foreignKeyChecksSql(bool $on): string;
}
