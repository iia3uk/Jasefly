<?php
declare(strict_types=1);

namespace App\Modules\Scheduler;

use App\Database;

/** Orchestrates cron schedules + job processing for one tick. */
final class SchedulerTick
{
    public function __construct(private Database $db) {}

    /**
     * @return array{processed:int, completed:int, failed:int, recovered:int, cron_enqueued:int, last_tick_at:?string}
     */
    public function tick(int $limit = 20, int $timeBudgetSec = 20): array
    {
        $cronEnqueued = $this->enqueueDueCron();
        $runner = new JobRunner($this->db);
        $stats = $runner->run($limit, $timeBudgetSec);
        $stats['cron_enqueued'] = $cronEnqueued;
        $stats['last_tick_at'] = $runner->getMeta('last_tick_at');
        return $stats;
    }

    /** Lazy admin tick — only if last tick is older than $staleMinutes. */
    public function lazyTick(int $staleMinutes = 5, int $limit = 3, int $timeBudgetSec = 2): ?array
    {
        $runner = new JobRunner($this->db);
        $last = $runner->getMeta('last_tick_at');
        if ($last) {
            $ts = strtotime($last . ' UTC');
            if ($ts && (time() - $ts) < ($staleMinutes * 60)) {
                return null;
            }
        }
        return $this->tick($limit, $timeBudgetSec);
    }

    private function enqueueDueCron(): int
    {
        $n = 0;
        try {
            $rows = $this->db->all(
                "SELECT * FROM cron_schedules WHERE is_active=1 AND (next_run_at IS NULL OR next_run_at <= NOW()) LIMIT 20"
            );
        } catch (\Throwable) {
            return 0;
        }
        $queue = new JobQueue($this->db);
        foreach ($rows as $row) {
            $jobType = (string) $row['job_type'];
            $owner = JobHandlerRegistry::ownerOf($jobType);
            if ($owner !== null && !$this->isOwnerActive($owner)) {
                // Skip enqueue while owner package is disabled; keep schedule row for re-enable.
                $next = $this->nextFromExpression((string) $row['expression']);
                $this->db->run(
                    'UPDATE cron_schedules SET next_run_at=? WHERE id=?',
                    [$next, (int) $row['id']]
                );
                continue;
            }
            $queue->push(
                $jobType,
                json_decode((string) ($row['payload'] ?? '{}'), true) ?: [],
                null,
                'cron',
                10,
                3,
                'cron:' . $row['id'] . ':' . date('YmdHi')
            );
            $next = $this->nextFromExpression((string) $row['expression']);
            $this->db->run(
                'UPDATE cron_schedules SET last_run_at=NOW(), next_run_at=? WHERE id=?',
                [$next, (int) $row['id']]
            );
            $n++;
        }
        return $n;
    }

    private function isOwnerActive(string $owner): bool
    {
        if (in_array($owner, ['scheduler', 'platform'], true)) {
            return true;
        }
        try {
            $row = $this->db->one('SELECT is_enabled FROM modules WHERE name=? LIMIT 1', [$owner]);
            if (!$row) {
                return true;
            }
            return (int) ($row['is_enabled'] ?? 0) === 1;
        } catch (\Throwable) {
            return true;
        }
    }

    /** Minimal cron: supports every-N-minutes and hourly/daily shortcuts. */
    private function nextFromExpression(string $expr): string
    {
        $expr = trim($expr);
        if (preg_match('#^\*/(\d+)\s+\*\s+\*\s+\*\s+\*$#', $expr, $m)) {
            $mins = max(1, (int) $m[1]);
            return (new \DateTimeImmutable('now'))->modify("+{$mins} minutes")->format('Y-m-d H:i:s');
        }
        if ($expr === '0 * * * *') {
            return (new \DateTimeImmutable('now'))->modify('+1 hour')->setTime((int) date('H') + 1, 0)->format('Y-m-d H:i:s');
        }
        return (new \DateTimeImmutable('now'))->modify('+5 minutes')->format('Y-m-d H:i:s');
    }
}
