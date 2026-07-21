<?php
declare(strict_types=1);

namespace App\Core\Db;

use App\Database;

final class PgInspector implements SchemaInspector
{
    public function __construct(private Database $db) {}

    public function tableExists(string $table): bool
    {
        $row = $this->db->one(
            "SELECT to_regclass(?) AS exists",
            ['public.' . $table]
        );
        return $row !== null && !empty($row['exists']);
    }

    public function columnExists(string $table, string $column): bool
    {
        try {
            $row = $this->db->one(
                "SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name=? AND column_name=?",
                [$table, $column]
            );
            return $row !== null;
        } catch (\Throwable) {
            return false;
        }
    }

    public function columns(string $table): array
    {
        $out = [];
        $rows = $this->db->all(
            "SELECT column_name, data_type, is_nullable
             FROM information_schema.columns
             WHERE table_schema='public' AND table_name=?
             ORDER BY ordinal_position",
            [$table]
        );
        foreach ($rows as $row) {
            $out[$row['column_name']] = [
                'name' => $row['column_name'],
                'type' => $row['data_type'],
                'nullable' => strcasecmp((string) $row['is_nullable'], 'YES') === 0,
            ];
        }
        return $out;
    }

    public function indexes(string $table): array
    {
        $out = [];
        $rows = $this->db->all(
            "SELECT indexname FROM pg_indexes WHERE schemaname='public' AND tablename=?",
            [$table]
        );
        foreach ($rows as $row) {
            $out[$row['indexname']] = true;
        }
        return $out;
    }

    public function listTables(): array
    {
        $out = [];
        foreach ($this->db->all("SELECT tablename FROM pg_tables WHERE schemaname='public'") as $row) {
            $out[] = $row['tablename'];
        }
        return $out;
    }

    public function foreignKeyChecks(bool $on): void
    {
        $this->db->run('SET session_replication_role = ' . ($on ? 'origin' : 'replica'));
    }
}
