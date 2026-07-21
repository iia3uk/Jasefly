<?php
declare(strict_types=1);

namespace App\Core\Db;

use App\Database;

final class SqliteInspector implements SchemaInspector
{
    public function __construct(private Database $db) {}

    public function tableExists(string $table): bool
    {
        $row = $this->db->one(
            "SELECT name FROM sqlite_master WHERE type='table' AND name=?",
            [$table]
        );
        return $row !== null;
    }

    public function columnExists(string $table, string $column): bool
    {
        try {
            foreach ($this->columns($table) as $name => $_) {
                if ($name === $column) {
                    return true;
                }
            }
            return false;
        } catch (\Throwable) {
            return false;
        }
    }

    public function columns(string $table): array
    {
        $out = [];
        foreach ($this->db->all("PRAGMA table_info(\"{$table}\")") as $row) {
            $out[$row['name']] = [
                'name' => $row['name'],
                'type' => $row['type'],
                'nullable' => (int) $row['notnull'] === 0,
            ];
        }
        return $out;
    }

    public function indexes(string $table): array
    {
        $out = [];
        foreach ($this->db->all("PRAGMA index_list(\"{$table}\")") as $row) {
            $out[$row['name']] = true;
        }
        return $out;
    }

    public function listTables(): array
    {
        $out = [];
        foreach ($this->db->all("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'") as $row) {
            $out[] = $row['name'];
        }
        return $out;
    }

    public function foreignKeyChecks(bool $on): void
    {
        $this->db->run('PRAGMA foreign_keys = ' . ($on ? 'ON' : 'OFF'));
    }
}
