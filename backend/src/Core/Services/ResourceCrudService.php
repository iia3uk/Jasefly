<?php
declare(strict_types=1);

namespace App\Core\Services;

use App\Database;
use App\Services\SlugService;
use App\Services\SoftDeleteService;
use App\Utils\Str;

/**
 * Shared CRUD engine used by content modules.
 * Modules pass resource configuration — no duplicated query logic.
 */
final class ResourceCrudService
{
    public function __construct(
        private Database $db,
        private SoftDeleteService $softDeletes,
        private SlugService $slugs,
    ) {}

    public function columns(string $table): array
    {
        return array_keys($this->db->inspector()->columns($table));
    }

    public function list(string $table, bool $includeDeleted = false): array
    {
        $where = $includeDeleted ? '1=1' : $this->softDeletes->notDeletedClause($table);
        $order = in_array('sort_order', $this->columns($table), true) ? 'sort_order, id DESC' : 'id DESC';
        return $this->db->all("SELECT * FROM `$table` WHERE $where ORDER BY $order");
    }

    public function find(string $table, int|string $id, bool $includeDeleted = false): ?array
    {
        $where = $includeDeleted ? '1=1' : $this->softDeletes->notDeletedClause($table);
        return $this->db->one("SELECT * FROM `$table` WHERE id=? AND $where", [$id]);
    }

    public function writable(string $table, array $data, ?int $excludeId = null): array
    {
        $columns = $this->columns($table);
        $out = [];
        foreach ($data as $key => $value) {
            if (!in_array($key, $columns, true) || in_array($key, ['id', 'created_at', 'updated_at', 'deleted_at'], true)) {
                continue;
            }
            $out[$key] = is_array($value) || is_object($value)
                ? json_encode($value, JSON_UNESCAPED_UNICODE)
                : $value;
        }

        if (in_array('slug', $columns, true)) {
            if (!isset($out['slug']) && isset($out['title'])) {
                $out['slug'] = $this->slugs->generate($table, (string) $out['title'], $excludeId);
            } elseif (!isset($out['slug']) && isset($out['name'])) {
                $out['slug'] = $this->slugs->generate($table, (string) $out['name'], $excludeId);
            } elseif (isset($out['slug'])) {
                $out['slug'] = Str::slug((string) $out['slug']);
            }
        }

        return $out;
    }

    public function insert(string $table, array $values): int
    {
        $cols = array_keys($values);
        $this->db->run(
            "INSERT INTO `$table` (`" . implode('`,`', $cols) . '`) VALUES(' . implode(',', array_fill(0, count($values), '?')) . ')',
            array_values($values)
        );
        return $this->db->id();
    }

    public function update(string $table, int|string $id, array $values): void
    {
        if (!$values) {
            return;
        }
        $this->db->run(
            "UPDATE `$table` SET " . implode(',', array_map(fn($c) => "`$c`=?", array_keys($values))) . ' WHERE id=?',
            array_merge(array_values($values), [$id])
        );
    }

    public function softDelete(string $table, int $id): void
    {
        $this->softDeletes->softDelete($table, $id);
    }
}
