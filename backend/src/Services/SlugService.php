<?php
declare(strict_types=1);

namespace App\Services;

use App\Database;
use App\Response;
use App\Utils\Str;

final class SlugService
{
    /** Reserved system slugs that must not be rewritten by Str::slug(). */
    public const RESERVED = ['__home'];

    public function __construct(private Database $db) {}

    public function generate(string $table, string $source, ?int $excludeId = null): string
    {
        $base = Str::slug($source);
        if ($base === '') {
            $base = 'item';
        }
        $slug = $base;
        $i = 2;
        while ($this->exists($table, $slug, $excludeId)) {
            $slug = $base . '-' . $i++;
        }
        return $slug;
    }

    public function exists(string $table, string $slug, ?int $excludeId = null): bool
    {
        // pages (and some tables) may not have deleted_at — never hardcode the column.
        $notDeleted = (new SoftDeleteService($this->db))->notDeletedClause($table);
        $sql = "SELECT id FROM `$table` WHERE slug=? AND $notDeleted";
        $params = [$slug];
        if ($excludeId) {
            $sql .= ' AND id<>?';
            $params[] = $excludeId;
        }
        return (bool) $this->db->one($sql, $params);
    }

    public function validate(string $table, string $slug, ?int $excludeId = null): ?string
    {
        if (in_array($slug, self::RESERVED, true)) {
            return null;
        }
        if (!preg_match('/^[a-z0-9]+(?:-[a-z0-9]+)*$/', $slug)) {
            return 'Slug must contain only lowercase letters, numbers, and hyphens.';
        }
        if ($this->exists($table, $slug, $excludeId)) {
            return 'Slug is already in use.';
        }
        return null;
    }

    /** Normalize slug for storage; keeps reserved system slugs intact. */
    public static function normalize(string $slug): string
    {
        $slug = trim($slug);
        if (in_array($slug, self::RESERVED, true)) {
            return $slug;
        }
        return Str::slug($slug);
    }

    public function trackChange(string $entityType, string $table, int $entityId, string $oldSlug, string $newSlug): void
    {
        if ($oldSlug === '' || $newSlug === '' || $oldSlug === $newSlug) {
            return;
        }
        try {
            $this->db->upsert(
                'slug_redirects',
                ['entity_type' => $entityType, 'old_slug' => $oldSlug, 'new_slug' => $newSlug, 'entity_id' => $entityId],
                ['entity_type', 'old_slug'],
                ['new_slug', 'entity_id'],
            );
        } catch (\Throwable) {
            // Missing slug_redirects table must not block page save.
        }
    }

    public function resolve(string $entityType, string $slug): ?array
    {
        return $this->db->one(
            'SELECT new_slug, entity_id FROM slug_redirects WHERE entity_type=? AND old_slug=?',
            [$entityType, $slug]
        );
    }

    public function redirectOr404(string $entityType, string $slug, string $pathPrefix): never
    {
        $redirect = $this->resolve($entityType, $slug);
        if (!$redirect) {
            Response::error('Not found', 404);
        }
        $location = rtrim($pathPrefix, '/') . '/' . $redirect['new_slug'];
        header('Location: ' . $location, true, 301);
        Response::json([
            'success' => true,
            'data' => ['redirect' => $location, 'status' => 301],
            'meta' => ['api_version' => 'v1'],
        ], 301);
    }
}
