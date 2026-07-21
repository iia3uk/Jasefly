<?php
declare(strict_types=1);

namespace App\Core\Db;

use App\Database;

final class MysqlInspector implements SchemaInspector
{
    public function __construct(private Database $db) {}

    public function tableExists(string $table): bool
    {
        $stmt = $this->db->run(
            'SELECT 1 FROM information_schema.tables
             WHERE table_schema = DATABASE() AND table_name = ?',
            [$table]
        );
        return $stmt->fetch() !== false;
    }

    public function columnExists(string $table, string $column): bool
    {
        // information_schema accepts a placeholder (unlike `SHOW COLUMNS ... LIKE ?`).
        $row = $this->db->one(
            'SELECT 1 FROM information_schema.columns
             WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?',
            [$table, $column]
        );
        return $row !== null;
    }

    public function columns(string $table): array
    {
        $out = [];
        foreach ($this->db->all("SHOW COLUMNS FROM `{$table}`") as $row) {
            $out[$row['Field']] = [
                'name' => $row['Field'],
                'type' => $row['Type'],
                'nullable' => strcasecmp((string) $row['Null'], 'YES') === 0,
            ];
        }
        return $out;
    }

    public function indexes(string $table): array
    {
        $out = [];
        foreach ($this->db->all("SHOW INDEX FROM `{$table}`") as $row) {
            $out[$row['Key_name']] = true;
        }
        return $out;
    }

    public function listTables(): array
    {
        $rows = $this->db->all("SHOW FULL TABLES WHERE Table_type = 'BASE TABLE'");
        $out = [];
        foreach ($rows as $row) {
            $out[] = (string) array_values($row)[0];
        }
        return $out;
    }

    public function foreignKeyChecks(bool $on): void
    {
        $this->db->run('SET FOREIGN_KEY_CHECKS = ' . ($on ? '1' : '0'));
    }
}
