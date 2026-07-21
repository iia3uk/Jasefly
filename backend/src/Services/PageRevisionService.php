<?php
declare(strict_types=1);

namespace App\Services;

use App\Database;

/**
 * Page revision history: snapshots of page layout/content for rollback.
 *
 * A revision is created on every publish (and optionally on save). The
 * admin can list, view and restore revisions. Restoring overwrites the
 * live page with the snapshot's layout/content/title.
 */
final class PageRevisionService
{
    public function __construct(private Database $db) {}

    public function list(int $pageId): array
    {
        return $this->db->all(
            'SELECT id, page_id, title, author_id, note, created_at
             FROM `page_revisions`
             WHERE page_id = ?
             ORDER BY id DESC
             LIMIT 100',
            [$pageId]
        );
    }

    public function snapshot(int $pageId, ?int $authorId = null, ?string $note = null): int
    {
        $page = $this->db->one('SELECT title, layout_json, content FROM `pages` WHERE id = ?', [$pageId]);
        if (!$page) {
            return 0;
        }
        $this->db->run(
            'INSERT INTO `page_revisions` (page_id, layout_json, content, title, author_id, note)
             VALUES (?, ?, ?, ?, ?, ?)',
            [$pageId, $page['layout_json'] ?? null, $page['content'] ?? null, $page['title'] ?? null, $authorId, $note]
        );
        return $this->db->id();
    }

    public function get(int $revisionId): ?array
    {
        return $this->db->one('SELECT * FROM `page_revisions` WHERE id = ?', [$revisionId]);
    }

    public function restore(int $revisionId): ?array
    {
        $rev = $this->get($revisionId);
        if (!$rev) {
            return null;
        }
        // Snapshot the current state before overwriting, so restore is reversible.
        $this->snapshot((int) $rev['page_id'], null, 'Auto-snapshot before restore');

        $this->db->run(
            'UPDATE `pages` SET layout_json = ?, content = ?, title = ? WHERE id = ?',
            [$rev['layout_json'] ?? null, $rev['content'] ?? null, $rev['title'] ?? null, $rev['page_id']]
        );
        return $rev;
    }
}
