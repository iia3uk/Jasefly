<?php
declare(strict_types=1);

namespace App\Core\Db;

final class MysqlDialect implements Dialect
{
    public function name(): string { return 'mysql'; }

    public function quoteIdent(string $ident): string
    {
        return '`' . str_replace('`', '``', $ident) . '`';
    }

    public function columnType(string $bpType): string
    {
        return match ($bpType) {
            'string' => 'VARCHAR(255)',
            'text' => 'TEXT',
            'longtext' => 'LONGTEXT',
            'int' => 'INT',
            'bigint' => 'BIGINT',
            'decimal' => 'DECIMAL(12,2)',
            'bool' => 'TINYINT(1)',
            'date' => 'DATE',
            'datetime' => 'DATETIME',
            'json' => 'JSON',
            'uuid' => 'CHAR(36)',
            default => 'VARCHAR(255)',
        };
    }

    public function supportsFulltext(): bool { return true; }
    public function supportsOnUpdateTimestamp(): bool { return true; }

    public function upsertConflictClause(array $uniqueCols, array $updateCols): string
    {
        $sets = [];
        foreach ($updateCols as $c) {
            $sets[] = $this->quoteIdent($c) . ' = VALUES(' . $this->quoteIdent($c) . ')';
        }
        return ' ON DUPLICATE KEY UPDATE ' . implode(', ', $sets ?: $updateCols);
    }

    public function foreignKeyChecksSql(bool $on): string
    {
        return 'SET FOREIGN_KEY_CHECKS = ' . ($on ? '1' : '0');
    }
}
