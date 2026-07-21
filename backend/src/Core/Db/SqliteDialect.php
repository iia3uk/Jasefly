<?php
declare(strict_types=1);

namespace App\Core\Db;

final class SqliteDialect implements Dialect
{
    public function name(): string { return 'sqlite'; }

    public function quoteIdent(string $ident): string
    {
        // SQLite accepts backticks, but double-quotes are the standard.
        return '"' . str_replace('"', '""', $ident) . '"';
    }

    public function columnType(string $bpType): string
    {
        // SQLite uses dynamic typing; pick affinities close to the blueprint.
        return match ($bpType) {
            'string', 'uuid' => 'TEXT',
            'text', 'longtext' => 'TEXT',
            'int' => 'INTEGER',
            'bigint' => 'INTEGER',
            'decimal' => 'REAL',
            'bool' => 'INTEGER',
            'date', 'datetime' => 'TEXT',
            'json' => 'TEXT',
            default => 'TEXT',
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
            $sets[] = "$q = excluded.$q";
        }
        return " ON CONFLICT($target) DO UPDATE SET " . implode(', ', $sets);
    }

    public function foreignKeyChecksSql(bool $on): string
    {
        return 'PRAGMA foreign_keys = ' . ($on ? 'ON' : 'OFF');
    }
}
