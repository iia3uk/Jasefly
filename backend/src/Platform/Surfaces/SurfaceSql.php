<?php
declare(strict_types=1);

namespace App\Platform\Surfaces;

/**
 * Safe SQL fragments from package surface declarations (equality where only).
 */
final class SurfaceSql
{
    /**
     * @param array<string, mixed> $where column => scalar
     * @return array{0: string, 1: list<mixed>} SQL AND-clauses (no leading AND) + params
     */
    public static function equalityWhere(array $where): array
    {
        $parts = [];
        $params = [];
        foreach ($where as $col => $val) {
            $c = self::ident((string) $col);
            if ($c === null) {
                continue;
            }
            if ($val === null) {
                $parts[] = "`{$c}` IS NULL";
                continue;
            }
            if (is_bool($val)) {
                $parts[] = "`{$c}`=?";
                $params[] = $val ? 1 : 0;
                continue;
            }
            if (is_int($val) || is_float($val) || is_string($val)) {
                $parts[] = "`{$c}`=?";
                $params[] = $val;
            }
        }
        if ($parts === []) {
            return ['1=1', []];
        }
        return [implode(' AND ', $parts), $params];
    }

    public static function ident(string $name): ?string
    {
        $name = trim($name);
        if ($name === '' || !preg_match('/^[a-z][a-z0-9_]{0,63}$/', $name)) {
            return null;
        }
        return $name;
    }

    /**
     * @param array<string, mixed> $row surface media/sitemap def
     */
    public static function softDeleteClause(array $row, string $alias = ''): string
    {
        if (empty($row['soft_delete'])) {
            return '1=1';
        }
        $col = $alias !== '' ? "{$alias}.deleted_at" : 'deleted_at';
        return "{$col} IS NULL";
    }
}
