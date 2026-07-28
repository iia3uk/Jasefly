<?php
declare(strict_types=1);

namespace App\Core\Services;

use App\Core\Contract\Blueprint;
use App\Core\Db\Dialect;
use App\Core\Db\SchemaInspector;
use App\Database;
use Throwable;

/**
 * Auto-migration engine driven by blueprints.
 *
 * Given a blueprint, introspects the live table (via {@see SchemaInspector})
 * and applies the minimal idempotent set of DDL statements (emitted through
 * the active {@see Dialect}) to make the schema match the blueprint's declared
 * columns and indexes. Tables are created if missing.
 *
 * Driver-agnostic: works on mysql, sqlite and pgsql.
 */
final class BlueprintMigrationService
{
    public function __construct(
        private Database $db,
        private Dialect $dialect,
        private SchemaInspector $inspector,
    ) {}

    /**
     * Compute and apply the diff for a single blueprint.
     *
     * @return array{key:string, table:string, created:bool, statements:list<string>, error:?string}
     */
    public function migrate(Blueprint $bp): array
    {
        $table = $bp->table();
        $result = [
            'key' => $bp->key(),
            'table' => $table,
            'created' => false,
            'statements' => [],
            'error' => null,
        ];

        try {
            if (!$this->inspector->tableExists($table)) {
                $stmts = $this->sqlCreateTable($bp);
                foreach ($stmts as $stmt) {
                    $this->db->pdo()->exec($stmt);
                    $result['statements'][] = $stmt;
                }
                $result['created'] = true;
                // Emit updated_at trigger where the driver needs it.
                foreach ($this->triggerStatements($table) as $tr) {
                    $this->db->pdo()->exec($tr);
                    $result['statements'][] = $tr;
                }
                return $result;
            }

            $liveColumns = $this->inspector->columns($table);
            foreach ($bp->columns() as $name => $col) {
                if (isset($liveColumns[$name])) {
                    continue;
                }
                $stmt = $this->sqlAddColumn($table, $name, $col);
                $this->db->pdo()->exec($stmt);
                $result['statements'][] = $stmt;
            }

            $liveIndexes = $this->inspector->indexes($table);
            foreach ($bp->indexes() as $idx) {
                $name = (string) ($idx['name'] ?? '');
                if ($name === '' || isset($liveIndexes[$name])) {
                    continue;
                }
                $stmt = $this->sqlAddIndex($table, $idx);
                $this->db->pdo()->exec($stmt);
                $result['statements'][] = $stmt;
            }
        } catch (Throwable $e) {
            $result['error'] = $e->getMessage();
        }

        return $result;
    }

    /**
     * Migrate every blueprint registered in the kernel.
     *
     * @param array<Blueprint> $blueprints
     * @return list<array{key:string, table:string, created:bool, statements:list<string>, error:?string}>
     */
    public function migrateAll(array $blueprints): array
    {
        $out = [];
        foreach ($blueprints as $bp) {
            $out[] = $this->migrate($bp);
        }
        return $out;
    }

    /**
     * Build the CREATE TABLE statement plus any separate CREATE INDEX
     * statements (inline INDEX is MySQL-only; sqlite/pgsql need them separate).
     *
     * @return list<string>
     */
    private function sqlCreateTable(Blueprint $bp): array
    {
        $q = $this->dialect;
        $table = $q->quoteIdent($bp->table());
        $parts = [];
        $indexStmts = [];
        $parts[] = $q->quoteIdent('id') . ' ' . $this->idColumnType() . ' PRIMARY KEY';
        foreach ($bp->columns() as $name => $col) {
            $parts[] = $this->columnDef($name, $col);
        }
        if ($bp->softDelete()) {
            $parts[] = $q->quoteIdent('deleted_at') . ' ' . $this->dialect->columnType('datetime') . ' NULL DEFAULT NULL';
            $indexStmts[] = 'CREATE INDEX ' . $q->quoteIdent('idx_deleted_at') . ' ON ' . $table . ' (' . $q->quoteIdent('deleted_at') . ')';
        }
        if ($bp->sluggable()) {
            $parts[] = $q->quoteIdent('slug') . ' VARCHAR(255) NOT NULL DEFAULT ' . "''";
            $indexStmts[] = 'CREATE UNIQUE INDEX ' . $q->quoteIdent('uniq_slug') . ' ON ' . $table . ' (' . $q->quoteIdent('slug') . ')';
        }
        foreach ($bp->indexes() as $idx) {
            $indexStmts[] = $this->sqlAddIndex($bp->table(), $idx);
        }
        $parts[] = $q->quoteIdent('created_at') . ' ' . $q->columnType('datetime') . ' NOT NULL DEFAULT CURRENT_TIMESTAMP';
        $parts[] = $q->quoteIdent('updated_at') . ' ' . $q->columnType('datetime') . ' NOT NULL DEFAULT CURRENT_TIMESTAMP'
            . ($q->supportsOnUpdateTimestamp() ? ' ON UPDATE CURRENT_TIMESTAMP' : '');

        $create = 'CREATE TABLE IF NOT EXISTS ' . $table . " (\n  " . implode(",\n  ", $parts) . "\n)";
        return array_merge([$create], $indexStmts);
    }

    /** @param array<string,mixed> $col */
    private function sqlAddColumn(string $table, string $name, array $col): string
    {
        return 'ALTER TABLE ' . $this->dialect->quoteIdent($table) . ' ADD COLUMN ' . $this->columnDef($name, $col);
    }

    /** @param array<string,mixed> $col */
    private function columnDef(string $name, array $col): string
    {
        $q = $this->dialect;
        $type = $q->columnType($col['type'] ?? 'string');
        $def = $q->quoteIdent($name) . ' ' . $type;
        $def .= (($col['required'] ?? false) === true) ? ' NOT NULL' : ' NULL';
        $default = $col['default'] ?? null;
        if ($default !== null) {
            $def .= ' DEFAULT ' . $this->formatDefault($default, $col['type'] ?? 'string');
        } elseif (($col['required'] ?? false) === false) {
            $def .= ' DEFAULT NULL';
        }
        return $def;
    }

    /** @param array<string,mixed> $idx */
    private function sqlAddIndex(string $table, array $idx): string
    {
        // indexDef already emits "CREATE [UNIQUE] INDEX name ON table (cols)" when $table is given.
        return $this->indexDef($idx, $table);
    }

    /** @param array<string,mixed> $idx */
    private function indexDef(array $idx, ?string $table = null): string
    {
        $q = $this->dialect;
        $name = (string) ($idx['name'] ?? '');
        $columns = (array) ($idx['columns'] ?? []);
        $cols = implode(', ', array_map([$q, 'quoteIdent'], $columns));
        $type = (string) ($idx['type'] ?? 'index');
        $prefix = match ($type) {
            'unique' => 'UNIQUE INDEX ',
            'fulltext' => $q->supportsFulltext() ? 'FULLTEXT INDEX ' : 'INDEX ',
            default => 'INDEX ',
        };
        if ($table !== null) {
            // Standalone statement: CREATE [UNIQUE] INDEX name ON table (cols)
            return 'CREATE ' . $prefix . $q->quoteIdent($name) . ' ON ' . $q->quoteIdent($table) . ' (' . $cols . ')';
        }
        // Inline (MySQL CREATE TABLE only).
        return $prefix . $q->quoteIdent($name) . ' (' . $cols . ')';
    }

    private function formatDefault(mixed $default, string $type): string
    {
        if (is_bool($default)) {
            return $default ? '1' : '0';
        }
        if (is_int($default) || is_float($default)) {
            return (string) $default;
        }
        if ($default === 'CURRENT_TIMESTAMP') {
            return 'CURRENT_TIMESTAMP';
        }
        return "'" . addslashes((string) $default) . "'";
    }

    /** Driver-specific PRIMARY KEY id column type. */
    private function idColumnType(): string
    {
        return match ($this->dialect->name()) {
            'sqlite' => 'INTEGER',
            'pgsql' => 'BIGINT GENERATED BY DEFAULT AS IDENTITY',
            default => 'BIGINT UNSIGNED NOT NULL AUTO_INCREMENT',
        };
    }

    /**
     * For drivers without ON UPDATE CURRENT_TIMESTAMP, emit a trigger that
     * keeps updated_at fresh.
     * @return list<string>
     */
    private function triggerStatements(string $table): array
    {
        if ($this->dialect->supportsOnUpdateTimestamp()) {
            return [];
        }
        $q = $this->dialect;
        $tq = $q->quoteIdent($table);
        if ($this->dialect->name() === 'sqlite') {
            return ["CREATE TRIGGER IF NOT EXISTS " . $q->quoteIdent("trg_{$table}_updated_at")
                . " AFTER UPDATE ON {$tq} FOR EACH ROW WHEN NEW." . $q->quoteIdent('updated_at') . " = OLD." . $q->quoteIdent('updated_at')
                . " BEGIN UPDATE {$tq} SET " . $q->quoteIdent('updated_at') . " = CURRENT_TIMESTAMP WHERE rowid = OLD.rowid; END"];
        }
        // pgsql
        return [
            "CREATE OR REPLACE FUNCTION _cms_set_updated_at() RETURNS trigger LANGUAGE plpgsql AS \$\$ BEGIN NEW.updated_at = CURRENT_TIMESTAMP; RETURN NEW; END; \$\$",
            "DROP TRIGGER IF EXISTS trg_{$table}_updated_at",
            "CREATE TRIGGER trg_{$table}_updated_at BEFORE UPDATE ON {$tq} FOR EACH ROW EXECUTE FUNCTION _cms_set_updated_at()",
        ];
    }
}
