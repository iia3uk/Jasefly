<?php
declare(strict_types=1);

namespace App\Services;

use App\Database;
use Throwable;

/**
 * Lazy scheduled publish for pages (no cron required on shared hosting).
 * Drafts with scheduled_at <= NOW() become published on the next public/admin hit.
 */
final class PageScheduleService
{
    public function __construct(private Database $db) {}

    /** Promote all due drafts. Returns number of rows updated. */
    public function promoteDue(): int
    {
        try {
            $stmt = $this->db->run(
                "UPDATE pages
                 SET status='published',
                     published_at=COALESCE(published_at, NOW()),
                     scheduled_at=NULL
                 WHERE status='draft'
                   AND scheduled_at IS NOT NULL
                   AND scheduled_at <= NOW()"
            );
            return (int) $stmt->rowCount();
        } catch (Throwable) {
            return 0;
        }
    }

    /**
     * Promote a single slug if due, then return the current published row (if any).
     *
     * @return array<string, mixed>|null
     */
    public function publishedAfterPromote(string $slug): ?array
    {
        try {
            $this->db->run(
                "UPDATE pages
                 SET status='published',
                     published_at=COALESCE(published_at, NOW()),
                     scheduled_at=NULL
                 WHERE slug=?
                   AND status='draft'
                   AND scheduled_at IS NOT NULL
                   AND scheduled_at <= NOW()",
                [$slug]
            );
            return $this->db->one(
                "SELECT * FROM pages WHERE slug=? AND status='published'",
                [$slug]
            );
        } catch (Throwable) {
            return null;
        }
    }
}
