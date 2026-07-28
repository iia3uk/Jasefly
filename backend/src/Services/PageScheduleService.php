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
    private ?string $lastError = null;

    public function __construct(private Database $db) {}

    public function lastError(): ?string
    {
        return $this->lastError;
    }

    /**
     * Promote all due drafts.
     *
     * @return array{promoted:int, error:?string}
     */
    public function promoteDue(): array
    {
        $this->lastError = null;
        $now = $this->sqlNow();
        try {
            $stmt = $this->db->run(
                "UPDATE pages
                 SET status='published',
                     published_at=COALESCE(published_at, {$now}),
                     scheduled_at=NULL
                 WHERE status='draft'
                   AND scheduled_at IS NOT NULL
                   AND scheduled_at <= {$now}"
            );
            $n = (int) $stmt->rowCount();
            if ($n > 0) {
                @error_log('PageScheduleService: promoted ' . $n . ' due page(s)');
            }
            return ['promoted' => $n, 'error' => null];
        } catch (Throwable $e) {
            $this->lastError = $e->getMessage();
            @error_log('PageScheduleService::promoteDue failed: ' . $e->getMessage());
            return ['promoted' => 0, 'error' => $this->lastError];
        }
    }

    /**
     * Promote a single slug if due, then return the current published row (if any).
     *
     * @return array<string, mixed>|null
     */
    public function publishedAfterPromote(string $slug): ?array
    {
        $this->lastError = null;
        $now = $this->sqlNow();
        try {
            $this->db->run(
                "UPDATE pages
                 SET status='published',
                     published_at=COALESCE(published_at, {$now}),
                     scheduled_at=NULL
                 WHERE slug=?
                   AND status='draft'
                   AND scheduled_at IS NOT NULL
                   AND scheduled_at <= {$now}",
                [$slug]
            );
            return $this->db->one(
                "SELECT * FROM pages WHERE slug=? AND status='published'",
                [$slug]
            );
        } catch (Throwable $e) {
            $this->lastError = $e->getMessage();
            @error_log('PageScheduleService::publishedAfterPromote failed: ' . $e->getMessage());
            return null;
        }
    }

    /** Driver-safe "current timestamp" SQL fragment (not user input). */
    private function sqlNow(): string
    {
        return $this->db->driver() === 'sqlite' ? "datetime('now')" : 'NOW()';
    }
}
