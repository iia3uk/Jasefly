<?php
declare(strict_types=1);

namespace App\Core\Db;

final class PgDialect implements Dialect
{
    public function name(): string { return 'pgsql'; }

    public function quoteIdent(string $ident): string
    {
        return '"' . str_replace('"', '""', $ident) . '"';
    }

    public function columnType(string $bpType): string
    {
        return match ($bpType) {
            'string' => 'VARCHAR(255)',
            'text' => 'TEXT',
            'longtext' => 'TEXT',
            'int' => 'INTEGER',
            'bigint' => 'BIGINT',
            'decimal' => 'NUMERIC(12,2)',
            'bool' => 'SMALLINT',
            'date' => 'DATE',
            'datetime' => 'TIMESTAMP',
            'json' => 'JSONB',
            'uuid' => 'UUID',
            default => 'VARCHAR(255)',
        };
    }

    public function supportsFulltext(): bool { return false; }
    public function supportsOnUpdateTimestamp(): bool { return false; }

    public function upsertConflictClause(array $uniqueCols, array $updateCols): string
    {
        $target = implode(', ', array_map([$this, 'quoteIdent'], $uniqueCols));
        $sets = [];
        foreach ($updateCols as $c) {
            $q = $this->quoteIdent($c);
            $sets[] = "$q = EXCLUDED.$q";
        }
        return " ON CONFLICT($target) DO UPDATE SET " . implode(', ', $sets);
    }

    public function foreignKeyChecksSql(bool $on): string
    {
        // Disable triggers to bypass FK checks during schema wipes.
        return 'SET session_replication_role = ' . ($on ? 'origin' : 'replica');
    }
}
