<?php
declare(strict_types=1);

namespace App\Services;

use App\Core\Container;
use App\Core\ModuleRegistry;
use App\Database;

/**
 * Live DB schema snapshot for the MCP agent (tables created? columns?).
 * Read-only; no dumps of row data.
 */
final class SchemaSnapshotService
{
    public function __construct(private Database $db) {}

    /**
     * @param array{table?:string, counts?:bool, detail?:string} $opts
     * @return array<string, mixed>
     */
    public function snapshot(array $opts = []): array
    {
        $inspector = $this->db->inspector();
        $filter = trim((string) ($opts['table'] ?? ''));
        $withCounts = !empty($opts['counts']);
        $detail = strtolower(trim((string) ($opts['detail'] ?? 'names')));
        if (!in_array($detail, ['names', 'full'], true)) {
            $detail = 'names';
        }
        // Single-table request always includes columns.
        $wantColumns = $detail === 'full' || $filter !== '';

        $all = $inspector->listTables();
        sort($all, SORT_STRING | SORT_FLAG_CASE);

        $tables = [];
        foreach ($all as $name) {
            if ($filter !== '' && strcasecmp($name, $filter) !== 0) {
                continue;
            }
            $entry = ['name' => $name];
            if ($wantColumns) {
                $cols = $inspector->columns($name);
                $entry['column_count'] = count($cols);
                $entry['columns'] = array_values($cols);
                $entry['indexes'] = array_keys($inspector->indexes($name));
            }
            if ($withCounts) {
                try {
                    $qi = $this->db->dialect()->quoteIdent($name);
                    $row = $this->db->one('SELECT COUNT(*) AS c FROM ' . $qi);
                    $entry['row_count'] = (int) ($row['c'] ?? 0);
                } catch (\Throwable $e) {
                    $entry['row_count'] = null;
                    $entry['row_count_error'] = $e->getMessage();
                }
            }
            $tables[] = $entry;
        }

        if ($filter !== '' && $tables === []) {
            return [
                'for_agent' => true,
                'at' => gmdate('c'),
                'driver' => $this->db->driver(),
                'ok' => false,
                'error' => "Таблица «{$filter}» не найдена",
                'table_names' => $all,
                'table_count' => count($all),
                'expected' => $this->expectedReport($all),
                'hint' => 'Таблицы нет в БД — проверь миграции (cms_site_diagnostics → migrations) или имя.',
            ];
        }

        $expected = $this->expectedReport($all);

        return [
            'for_agent' => true,
            'at' => gmdate('c'),
            'driver' => $this->db->driver(),
            'ok' => ($expected['missing'] ?? []) === [],
            'detail' => $wantColumns ? 'full' : 'names',
            'table_count' => count($all),
            'table_names' => $all,
            'tables' => $tables,
            'expected' => $expected,
            'hint' => ($expected['missing'] ?? []) === []
                ? 'Все ожидаемые таблицы модулей на месте. detail=full или table=имя — колонки/индексы.'
                : 'Не хватает таблиц: ' . implode(', ', $expected['missing'])
                    . ' — смотри cms_site_diagnostics → migrations, затем cms_db_schema снова.',
        ];
    }

    /**
     * Tables declared by enabled modules (resources + blueprints) + meta.
     *
     * @return list<string>
     */
    public function expectedTables(): array
    {
        $names = [
            '_migrations',
            '_migration_state',
            'activity_logs',
            'pages',
            'users',
        ];

        try {
            /** @var ModuleRegistry $reg */
            $reg = Container::getInstance()->get(ModuleRegistry::class);
            foreach ($reg->all() as $module) {
                foreach ($module->resources() as $res) {
                    if (!is_array($res)) {
                        continue;
                    }
                    $t = trim((string) ($res['table'] ?? ''));
                    if ($t !== '') {
                        $names[] = $t;
                    }
                }
            }
            foreach ($reg->blueprints() as $bp) {
                $t = trim($bp->table());
                if ($t !== '') {
                    $names[] = $t;
                }
            }
        } catch (\Throwable) {
            // Registry may be unavailable during early boot — core list is enough.
        }

        $names = array_values(array_unique($names));
        sort($names, SORT_STRING | SORT_FLAG_CASE);
        return $names;
    }

    /**
     * @param list<string> $existing
     * @return array{from_modules: list<string>, present: list<string>, missing: list<string>, ok: bool}
     */
    private function expectedReport(array $existing): array
    {
        $expected = $this->expectedTables();
        $set = [];
        foreach ($existing as $t) {
            $set[strtolower($t)] = true;
        }
        $present = [];
        $missing = [];
        foreach ($expected as $t) {
            if (isset($set[strtolower($t)])) {
                $present[] = $t;
            } else {
                $missing[] = $t;
            }
        }
        return [
            'from_modules' => $expected,
            'present' => $present,
            'missing' => $missing,
            'ok' => $missing === [],
        ];
    }
}
