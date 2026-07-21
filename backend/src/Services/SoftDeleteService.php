<?php
declare(strict_types=1);

namespace App\Services;

use App\Database;

final class SoftDeleteService
{
    /** @var array<string, string> resource => table */
    public const TRASHABLE = [
        'projects' => 'projects',
        'blog' => 'blog_posts',
        'media' => 'media',
        'project-categories' => 'project_categories',
        'blog-categories' => 'blog_categories',
        'skill-categories' => 'skill_categories',
        'skills' => 'skills',
        'experience' => 'experience',
        'education' => 'education',
        'services' => 'services',
        'testimonials' => 'testimonials',
        'pages' => 'pages',
        'products' => 'products',
    ];

    public function __construct(private Database $db) {}

    public function table(string $resource): ?string
    {
        return self::TRASHABLE[$resource] ?? null;
    }

    /**
     * Soft-delete when supported; otherwise permanently remove the row.
     * @return 'trash'|'deleted'
     */
    public function trashOrDelete(string $resource, string $table, int $id): string
    {
        if ($this->table($resource) && $this->softDelete($table, $id)) {
            return 'trash';
        }
        $this->forceDelete($table, $id);
        return 'deleted';
    }

    public function softDelete(string $table, int $id): bool
    {
        if (!$this->hasDeletedAt($table)) {
            return false;
        }
        $this->db->run("UPDATE `$table` SET deleted_at=NOW() WHERE id=? AND deleted_at IS NULL", [$id]);
        return true;
    }

    public function restore(string $table, int $id): bool
    {
        $this->db->run("UPDATE `$table` SET deleted_at=NULL WHERE id=?", [$id]);
        return true;
    }

    public function forceDelete(string $table, int $id): void
    {
        $this->db->run("DELETE FROM `$table` WHERE id=?", [$id]);
    }

    public function emptyTrash(string $table): int
    {
        $count = (int) ($this->db->one("SELECT COUNT(*) c FROM `$table` WHERE deleted_at IS NOT NULL")['c'] ?? 0);
        $this->db->run("DELETE FROM `$table` WHERE deleted_at IS NOT NULL");
        return $count;
    }

    public function trash(string $table, int $limit = 200): array
    {
        // Skip tables that don't support soft delete (no deleted_at column)
        // or that don't exist yet (e.g. a plugin whose migration hasn't run).
        // Without this guard, allTrash() 500s on the first such table.
        if (!$this->hasDeletedAt($table)) {
            return [];
        }
        return $this->db->all(
            "SELECT * FROM `$table` WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC LIMIT ?",
            [$limit]
        );
    }

    public function allTrash(): array
    {
        $out = [];
        foreach (self::TRASHABLE as $resource => $table) {
            $items = $this->trash($table, 50);
            if ($items) {
                $out[$resource] = array_map(fn($row) => array_merge($row, ['resource' => $resource]), $items);
            }
        }
        return $out;
    }

    public function notDeletedClause(string $table, string $alias = ''): string
    {
        if (!$this->hasDeletedAt($table)) {
            return '1=1';
        }
        $col = $alias ? "$alias.deleted_at" : 'deleted_at';
        return "$col IS NULL";
    }

    private function hasDeletedAt(string $table): bool
    {
        static $cache = [];
        if (!isset($cache[$table])) {
            try {
                $cache[$table] = $this->db->inspector()->columnExists($table, 'deleted_at');
            } catch (Throwable) {
                // Table doesn't exist (e.g. plugin not migrated yet) — treat
                // as "no soft delete", so callers skip it instead of 500ing.
                $cache[$table] = false;
            }
        }
        return $cache[$table];
    }
}
