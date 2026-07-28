<?php
declare(strict_types=1);

namespace App\Core\Db;

/**
 * Transpiles MySQL-canonical migration SQL into the target driver's dialect.
 *
 * One input statement may yield several output statements (e.g. an ALTER TABLE
 * with inline indexes is split; inline CREATE TABLE indexes are extracted;
 * an ON UPDATE CURRENT_TIMESTAMP column spawns a trigger on sqlite/pgsql).
 *
 * @param string $driver Target driver: mysql | sqlite | pgsql
 */
final class SqlTranspiler
{
    private string $driver;
    /** Tables that need an updated_at trigger (sqlite/pgsql only). */
    private array $triggerTables = [];

    public function __construct(string $driver)
    {
        $this->driver = $driver;
    }

    /** Reset accumulated trigger state (call per migration file). */
    public function reset(): void
    {
        $this->triggerTables = [];
    }

    /** Pending trigger-creation statements accumulated during transpile(). */
    public function drainTriggers(): array
    {
        $out = $this->buildTriggers();
        $this->triggerTables = [];
        return $out;
    }

    /**
     * Transpile one MySQL statement into zero or more driver statements.
     * @return list<string>
     */
    public function transpile(string $stmt): array
    {
        $s = trim($stmt);
        if ($s === '') {
            return [];
        }

        // Skip MySQL-only session pragmas (FK checks handled by SchemaInspector).
        if (preg_match('/^SET\s+NAMES\s+/i', $s)) {
            return [];
        }
        if (preg_match('/^SET\s+FOREIGN_KEY_CHECKS\s*=/i', $s)) {
            return [];
        }

        // MySQL is the source dialect — pass through untouched.
        if ($this->driver === 'mysql') {
            return [$s];
        }

        if (preg_match('/^CREATE\s+TABLE/i', $s)) {
            return $this->transpileCreateTable($s);
        }
        if (preg_match('/^ALTER\s+TABLE/i', $s)) {
            return $this->transpileAlterTable($s);
        }
        if (preg_match('/^INSERT\s+IGNORE\b/i', $s)) {
            return $this->transpileInsertIgnore($s);
        }
        if (preg_match('/^DELETE\s+\w+\s+FROM\b/i', $s)) {
            return $this->transpileDeleteJoin($s);
        }
        if (preg_match('/^CREATE\s+(UNIQUE\s+)?FULLTEXT\s+INDEX/i', $s)) {
            return $this->transpileFulltextIndex($s);
        }

        // Fallback: generic identifier + type normalization.
        return [$this->normalizeGeneric($s)];
    }

    private function buildTriggers(): array
    {
        if ($this->driver === 'mysql' || !$this->triggerTables) {
            return [];
        }
        $out = [];
        if ($this->driver === 'pgsql') {
            $out[] = "CREATE OR REPLACE FUNCTION _cms_set_updated_at() RETURNS trigger LANGUAGE plpgsql AS \$\$ BEGIN NEW.updated_at = CURRENT_TIMESTAMP; RETURN NEW; END; \$\$";
        }
        foreach (array_keys($this->triggerTables) as $table) {
            $t = $this->quoteIdent($table);
            if ($this->driver === 'sqlite') {
                // Use rowid — works for tables without an `id` column (settings_kv,
                // modules, _migration_state, composite PKs).
                $out[] = "CREATE TRIGGER IF NOT EXISTS \"trg_{$table}_updated_at\" AFTER UPDATE ON {$t} FOR EACH ROW WHEN NEW.\"updated_at\" = OLD.\"updated_at\" BEGIN UPDATE {$t} SET \"updated_at\" = CURRENT_TIMESTAMP WHERE rowid = OLD.rowid; END";
            } else {
                $out[] = "DROP TRIGGER IF EXISTS trg_{$table}_updated_at";
                $out[] = "CREATE TRIGGER trg_{$table}_updated_at BEFORE UPDATE ON {$t} FOR EACH ROW EXECUTE FUNCTION _cms_set_updated_at()";
            }
        }
        return $out;
    }

    private function quoteIdent(string $ident): string
    {
        return '"' . str_replace('"', '""', $ident) . '"';
    }

    /** Map a concrete MySQL type to the target dialect. */
    private function mapType(string $type): string
    {
        $t = $type;
        // Strip UNSIGNED / ZEROFILL flags.
        $t = preg_replace('/\s+UNSIGNED/i', '', $t) ?? $t;
        $t = preg_replace('/\s+ZEROFILL/i', '', $t) ?? $t;

        if ($this->driver === 'sqlite') {
            return match (true) {
                preg_match('/^LONGTEXT$/i', $t) === 1 => 'TEXT',
                preg_match('/^JSON$/i', $t) === 1 => 'TEXT',
                preg_match('/^CHAR\(36\)$/i', $t) === 1 => 'TEXT',
                preg_match('/^TINYINT(\(\d+\))?$/i', $t) === 1 => 'INTEGER',
                preg_match('/^(SMALLINT|MEDIUMINT)/i', $t) === 1 => 'INTEGER',
                preg_match('/^(INT|BIGINT|INTEGER)/i', $t) === 1 => 'INTEGER',
                preg_match('/^DATETIME$/i', $t) === 1 => 'TEXT',
                preg_match('/^TIMESTAMP$/i', $t) === 1 => 'TEXT',
                preg_match('/^(FLOAT|DOUBLE|DECIMAL|NUMERIC|REAL)/i', $t) === 1 => 'NUMERIC',
                default => $t,
            };
        }
        // pgsql
        return match (true) {
            preg_match('/^LONGTEXT$/i', $t) === 1 => 'TEXT',
            preg_match('/^JSON$/i', $t) === 1 => 'JSONB',
            preg_match('/^CHAR\(36\)$/i', $t) === 1 => 'UUID',
            preg_match('/^TINYINT(\(\d+\))?$/i', $t) === 1 => 'SMALLINT',
            preg_match('/^MEDIUMINT/i', $t) === 1 => 'INTEGER',
            preg_match('/^INT(\(\d+\))?$/i', $t) === 1 => 'INTEGER',
            preg_match('/^BIGINT/i', $t) === 1 => 'BIGINT',
            preg_match('/^DATETIME$/i', $t) === 1 => 'TIMESTAMP',
            default => $t,
        };
    }

    /** Split a CREATE TABLE body on top-level commas (respecting parens/quotes). */
    private function splitTopLevel(string $body): array
    {
        $parts = [];
        $depth = 0;
        $cur = '';
        $inStr = false;
        $quote = '';
        $len = strlen($body);
        for ($i = 0; $i < $len; $i++) {
            $ch = $body[$i];
            if ($inStr) {
                $cur .= $ch;
                if ($ch === $quote && $body[$i - 1] !== '\\') {
                    $inStr = false;
                }
                continue;
            }
            if ($ch === "'" || $ch === '"') {
                $inStr = true;
                $quote = $ch;
                $cur .= $ch;
                continue;
            }
            if ($ch === '(') {
                $depth++;
            } elseif ($ch === ')') {
                $depth--;
            }
            if ($ch === ',' && $depth === 0) {
                $parts[] = trim($cur);
                $cur = '';
                continue;
            }
            $cur .= $ch;
        }
        if (trim($cur) !== '') {
            $parts[] = trim($cur);
        }
        return $parts;
    }

    /** @return list<string> */
    private function transpileCreateTable(string $s): array
    {
        // Match: CREATE TABLE [IF NOT EXISTS] `name` ( body ) [tail]
        if (!preg_match('/^CREATE\s+TABLE\s+(IF\s+NOT\s+EXISTS\s+)?[`"]?([A-Za-z0-9_]+)[`"]?\s*\((.*)\)(.*)$/is', $s, $m)) {
            return [$this->normalizeGeneric($s)];
        }
        $ifNotExists = trim($m[1]);
        $table = $m[2];
        $body = $m[3];
        // Strip MySQL tail (ENGINE=/CHARSET=/COLLATE=/AUTO_INCREMENT=...).
        $parts = $this->splitTopLevel($body);
        $cols = [];
        $extraIndexes = [];
        $hasUpdatedOnUpdate = false;
        foreach ($parts as $part) {
            $upper = strtoupper(ltrim($part));
            // Inline index definitions -> extracted to CREATE INDEX (sqlite/pg
            // don't allow inline INDEX in CREATE TABLE).
            if (preg_match('/^(FULLTEXT\s+)?(UNIQUE\s+)?(KEY|INDEX)\s+/i', $part)) {
                // Strip MySQL prefix lengths: `relative_path`(191) → `relative_path`
                $part = preg_replace('/([`"]?[A-Za-z0-9_]+[`"]?)\(\d+\)/', '$1', $part) ?? $part;
            }
            if (preg_match('/^(FULLTEXT\s+)?(UNIQUE\s+)?(KEY|INDEX)\s+[`"]?([A-Za-z0-9_]+)[`"]?\s*\(([^)]*)\)/i', $part, $idx)) {
                $isUnique = !empty($idx[2]);
                $colsQ = preg_replace_callback('/`([A-Za-z0-9_]+)`/', fn($x) => $this->quoteIdent($x[1]), $idx[5]) ?? $idx[5];
                $uniq = $isUnique ? 'UNIQUE ' : '';
                $extraIndexes[] = 'CREATE ' . $uniq . 'INDEX ' . $this->quoteIdent($idx[4]) . ' ON ' . $this->quoteIdent($table) . ' (' . $colsQ . ')';
                continue;
            }
            if (str_starts_with($upper, 'PRIMARY KEY') || str_starts_with($upper, 'FOREIGN KEY') || str_starts_with($upper, 'CONSTRAINT')) {
                $cols[] = $this->normalizeIdentifiers($part);
                continue;
            }
            // Column definition.
            $colOut = $this->transpileColumnDef($part, $table, $hasUpdatedOnUpdate);
            if ($colOut !== '') {
                $cols[] = $colOut;
            }
        }
        $tableQ = $this->quoteIdent($table);
        $sql = 'CREATE TABLE ' . $ifNotExists . $tableQ . " (\n  " . implode(",\n  ", $cols) . "\n)";
        if ($hasUpdatedOnUpdate) {
            $this->triggerTables[$table] = true;
        }
        return array_merge([$sql], $extraIndexes);
    }

    /** Transpile a single column definition line. Returns '' to drop it. */
    private function transpileColumnDef(string $part, string $table, bool &$hasUpdatedOnUpdate): string
    {
        $p = $part;
        // Detect `updated_at ... ON UPDATE CURRENT_TIMESTAMP`.
        if (preg_match('/[`"]?updated_at[`"]?\b/i', $p) && preg_match('/ON\s+UPDATE\s+CURRENT_TIMESTAMP/i', $p)) {
            $hasUpdatedOnUpdate = true;
            $p = preg_replace('/\s+ON\s+UPDATE\s+CURRENT_TIMESTAMP/i', '', $p) ?? $p;
        } else {
            $p = preg_replace('/\s+ON\s+UPDATE\s+CURRENT_TIMESTAMP(\(\))?/i', '', $p) ?? $p;
        }

        // Strip UNSIGNED / ZEROFILL early so AUTO_INCREMENT reordering matches.
        $p = preg_replace('/\s+UNSIGNED/i', '', $p) ?? $p;
        $p = preg_replace('/\s+ZEROFILL/i', '', $p) ?? $p;

        // ENUM(...) -> base type + CHECK constraint (sqlite uses flexible typing
        // without CHECK, since it cannot later ALTER the column type to widen it;
        // pgsql keeps the CHECK and 002 widens role via ALTER COLUMN TYPE).
        if (preg_match('/[`"]?([A-Za-z0-9_]+)[`"]?\s+ENUM\s*\(([^)]*)\)(.*)/i', $p, $em)) {
            $name = $em[1];
            $values = $em[2];
            $rest = $em[3];
            $base = 'TEXT';
            $p = $this->quoteIdent($name) . ' ' . $base . $rest;
            if ($this->driver === 'pgsql') {
                $p .= ' CHECK (' . $this->quoteIdent($name) . ' IN (' . $values . '))';
            }
        }

        // AUTO_INCREMENT handling (id columns).
        if (preg_match('/ON\s+UPDATE/i', $p)) {
            // safety
        }
        if (preg_match('/AUTO_INCREMENT/i', $p)) {
            $p = preg_replace('/\s+AUTO_INCREMENT/i', '', $p) ?? $p;
            if ($this->driver === 'sqlite') {
                // Reorder to: <type> PRIMARY KEY AUTOINCREMENT (drop NOT NULL dup).
                $p = preg_replace('/^([`"]?[A-Za-z0-9_]+[`"]?)\s+(?:INT|BIGINT|INTEGER)\s+(NOT\s+NULL\s+)?PRIMARY\s+KEY/i', '$1 INTEGER PRIMARY KEY', $p) ?? $p;
                $p = preg_replace('/PRIMARY\s+KEY/i', 'PRIMARY KEY AUTOINCREMENT', $p) ?? $p;
            } else {
                // pgsql: replace INT/BIGINT with GENERATED BY DEFAULT AS IDENTITY
                $p = preg_replace('/^([`"]?[A-Za-z0-9_]+[`"]?)\s+(?:INT|BIGINT|INTEGER)(\s+NOT\s+NULL)?\s+PRIMARY\s+KEY/i', '$1 BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY', $p) ?? $p;
            }
        }

        // Map the column type token.
        $p = $this->mapColumnTypeToken($p);

        // Backticks -> double quotes.
        $p = $this->normalizeIdentifiers($p);
        return $p;
    }

    /** Replace the first MySQL type token in a column def with the mapped type. */
    private function mapColumnTypeToken(string $p): string
    {
        return preg_replace_callback(
            '/^([`"]?[A-Za-z0-9_]+[`"]?\s+)([A-Z]+)(\(\d+(?:,\d+)?\))?/',
            function ($m) {
                $typeToken = $m[2] . ($m[3] ?? '');
                return $m[1] . $this->mapType($typeToken);
            },
            $p
        ) ?? $p;
    }

    /** Convert backtick identifiers to double-quoted identifiers. */
    private function normalizeIdentifiers(string $s): string
    {
        return preg_replace_callback('/`([A-Za-z0-9_]+)`/', fn($m) => $this->quoteIdent($m[1]), $s) ?? $s;
    }

    /** Build an index clause (inline) or CREATE INDEX statement. */
    private function indexClause(string $name, string $cols, bool $unique, bool $fulltext): string
    {
        $colsQ = trim($cols);
        $colsQ = preg_replace_callback('/`([A-Za-z0-9_]+)`/', fn($m) => $this->quoteIdent($m[1]), $colsQ) ?? $colsQ;
        $uniq = $unique ? 'UNIQUE ' : '';
        return $uniq . 'INDEX ' . $this->quoteIdent($name) . ' (' . $colsQ . ')';
    }

    /** @return list<string> */
    private function transpileAlterTable(string $s): array
    {
        if (!preg_match('/^ALTER\s+TABLE\s+[`"]?([A-Za-z0-9_]+)[`"]?\s+(.*)$/is', $s, $m)) {
            return [$this->normalizeGeneric($s)];
        }
        $table = $m[1];
        $rest = trim($m[2]);
        $tableQ = $this->quoteIdent($table);
        $clauses = $this->splitTopLevel($rest);
        $out = [];
        foreach ($clauses as $clause) {
            $c = preg_replace('/\s+/', ' ', trim($clause));
            if ($c === '') {
                continue;
            }
            if (preg_match('/^ADD\s+(UNIQUE\s+)?(KEY|INDEX)\s+[`"]?([A-Za-z0-9_]+)[`"]?\s*\(([^)]*)\)/i', $c, $im)) {
                $uniq = !empty($im[1]) ? 'UNIQUE ' : '';
                $colsQ = preg_replace_callback('/`([A-Za-z0-9_]+)`/', fn($x) => $this->quoteIdent($x[1]), $im[4]) ?? $im[4];
                $out[] = 'CREATE ' . $uniq . 'INDEX ' . $this->quoteIdent($im[3]) . ' ON ' . $tableQ . ' (' . $colsQ . ')';
                continue;
            }
            // ADD CONSTRAINT ... FOREIGN KEY: sqlite cannot add FK via ALTER; skip.
            if (preg_match('/^ADD\s+CONSTRAINT\b.*FOREIGN\s+KEY/i', $c)) {
                if ($this->driver === 'sqlite') {
                    continue;
                }
                $out[] = 'ALTER TABLE ' . $tableQ . ' ' . $this->normalizeIdentifiers($c);
                continue;
            }
            if (preg_match('/^ADD\s+COLUMN\b/i', $c)) {
                $c = preg_replace('/\s+AFTER\s+[`"]?[A-Za-z0-9_]+[`"]?/i', '', $c) ?? $c;
                $dummy = false;
                $def = $this->transpileColumnDef(preg_replace('/^ADD\s+COLUMN\s+/i', '', $c), $table, $dummy);
                $out[] = 'ALTER TABLE ' . $tableQ . ' ADD COLUMN ' . $def;
                continue;
            }
            if (preg_match('/^MODIFY\s+COLUMN\s+[`"]?([A-Za-z0-9_]+)[`"]?\s+(.*)$/i', $c, $mm)) {
                if ($this->driver === 'pgsql') {
                    // PostgreSQL: ALTER COLUMN ... TYPE takes only the type token
                    // (NOT NULL / DEFAULT are preserved from CREATE; changing them
                    // would need separate SET NOT NULL / SET DEFAULT clauses).
                    $typePart = trim(preg_replace('/\s+(NOT\s+NULL|DEFAULT\b.*$)/i', '', $mm[2]) ?? $mm[2]);
                    $out[] = 'ALTER TABLE ' . $tableQ . ' ALTER COLUMN ' . $this->quoteIdent($mm[1]) . ' TYPE ' . $this->mapType($typePart);
                }
                // sqlite: cannot MODIFY COLUMN — no-op (MySQL-only widen/nullability).
                continue;
            }
            // MySQL shorthand: MODIFY col_name ... (without COLUMN keyword)
            if (preg_match('/^MODIFY\s+[`"]?([A-Za-z0-9_]+)[`"]?\s+/i', $c)) {
                if ($this->driver === 'pgsql') {
                    if (preg_match('/^MODIFY\s+[`"]?([A-Za-z0-9_]+)[`"]?\s+(.*)$/i', $c, $mm)) {
                        $typePart = trim(preg_replace('/\s+(NOT\s+NULL|DEFAULT\b.*$)/i', '', $mm[2]) ?? $mm[2]);
                        $out[] = 'ALTER TABLE ' . $tableQ . ' ALTER COLUMN ' . $this->quoteIdent($mm[1]) . ' TYPE ' . $this->mapType($typePart);
                    }
                }
                // sqlite: cannot MODIFY — no-op
                continue;
            }
            $out[] = 'ALTER TABLE ' . $tableQ . ' ' . $this->normalizeIdentifiers($c);
        }
        return $out;
    }

    /** @return list<string> */
    private function transpileInsertIgnore(string $s): array
    {
        $s = preg_replace('/^INSERT\s+IGNORE\s+/i', 'INSERT ', $s) ?? $s;
        $s = $this->normalizeIdentifiers($s);
        if ($this->driver === 'sqlite') {
            return [preg_replace('/^INSERT\s+/i', 'INSERT OR IGNORE ', $s) ?? $s];
        }
        return [$s . ' ON CONFLICT DO NOTHING'];
    }

    /** @return list<string> */
    private function transpileFulltextIndex(string $s): array
    {
        $s = preg_replace('/^CREATE\s+FULLTEXT\s+INDEX/i', 'CREATE INDEX', $s) ?? $s;
        $s = preg_replace('/^CREATE\s+UNIQUE\s+FULLTEXT\s+INDEX/i', 'CREATE UNIQUE INDEX', $s) ?? $s;
        return [$this->normalizeIdentifiers($s)];
    }

    /**
     * MySQL multi-table DELETE:
     *   DELETE rp FROM role_permissions rp INNER JOIN roles r ON ... WHERE ...
     * → SQLite/Pg:
     *   DELETE FROM role_permissions WHERE rowid|ctid IN (
     *     SELECT rp.rowid FROM role_permissions rp INNER JOIN ... WHERE ...
     *   )
     *
     * @return list<string>
     */
    private function transpileDeleteJoin(string $s): array
    {
        if (!preg_match(
            '/^DELETE\s+(?P<alias>\w+)\s+FROM\s+(?P<table>[`"]?[\w]+[`"]?)\s+(?P=alias)\b(?P<body>.*)$/is',
            $s,
            $m
        )) {
            return [$this->normalizeGeneric($s)];
        }

        $alias = $m['alias'];
        $table = trim($m['table'], '`"');
        $body = $m['body'];
        $tableQ = $this->quoteIdent($table);
        $bodyN = $this->normalizeIdentifiers($body);

        if ($this->driver === 'sqlite') {
            return [
                'DELETE FROM ' . $tableQ . ' WHERE rowid IN ('
                . 'SELECT ' . $alias . '.rowid FROM ' . $tableQ . ' ' . $alias . $bodyN
                . ')',
            ];
        }

        // pgsql: use ctid
        return [
            'DELETE FROM ' . $tableQ . ' WHERE ctid IN ('
            . 'SELECT ' . $alias . '.ctid FROM ' . $tableQ . ' ' . $alias . $bodyN
            . ')',
        ];
    }

    private function normalizeGeneric(string $s): string
    {
        $s = preg_replace('/\s+ON\s+UPDATE\s+CURRENT_TIMESTAMP(\(\))?/i', '', $s) ?? $s;
        $s = preg_replace('/\s+UNSIGNED/i', '', $s) ?? $s;
        return $this->normalizeIdentifiers($s);
    }
}