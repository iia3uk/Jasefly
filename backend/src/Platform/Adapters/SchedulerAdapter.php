<?php
declare(strict_types=1);

namespace App\Platform\Adapters;

use App\Database;
use App\Modules\Scheduler\JobHandlerRegistry;
use App\Modules\Scheduler\JobQueue;
use App\Modules\Scheduler\PackageJobLifecycle;
use App\Platform\Contracts\PlatformJobsInterface;
use App\Platform\Contracts\PlatformSchedulerInterface;

final class SchedulerAdapter implements PlatformSchedulerInterface, PlatformJobsInterface
{
    public function __construct(
        private Database $db,
        private string $moduleSlug,
    ) {}

    public function resolveType(string $jobType): string
    {
        $local = trim($jobType);
        if ($local === '' || str_contains($local, '..') || str_contains($local, ' ')) {
            throw new \InvalidArgumentException('Invalid job type');
        }
        $slug = $this->moduleSlug;
        if (str_starts_with($local, $slug . '.')) {
            return $local;
        }
        // Always force package namespace — never allow claiming another package's prefix.
        return $slug . '.' . ltrim($local, '.');
    }

    private function cronName(string $name): string
    {
        $local = trim($name);
        if ($local === '' || !preg_match('/^[a-zA-Z0-9_.:-]+$/', $local)) {
            throw new \InvalidArgumentException('Invalid cron name');
        }
        $slug = $this->moduleSlug;
        if (str_starts_with($local, $slug . ':')) {
            return $local;
        }
        return $slug . ':' . $local;
    }

    public function registerHandler(string $jobType, callable $handler): void
    {
        $type = $this->resolveType($jobType);
        JobHandlerRegistry::register($type, $handler, $this->moduleSlug);
    }

    public function unregisterHandler(string $jobType): void
    {
        JobHandlerRegistry::unregister($this->resolveType($jobType));
    }

    public function unregisterAllHandlers(): void
    {
        JobHandlerRegistry::unregisterByOwner($this->moduleSlug);
    }

    public function enqueue(string $jobType, array $payload = [], ?int $delaySeconds = null): int
    {
        return $this->enqueueEx($jobType, $payload, $delaySeconds);
    }

    public function enqueueEx(
        string $jobType,
        array $payload = [],
        ?int $delaySeconds = null,
        string $queue = 'default',
        int $priority = 0,
        int $maxAttempts = 5,
        ?string $dedupeKey = null,
    ): int {
        $type = $this->resolveType($jobType);
        $jobs = new JobQueue($this->db);
        $at = $delaySeconds !== null
            ? (new \DateTimeImmutable('now'))->modify('+' . max(0, $delaySeconds) . ' seconds')
            : null;
        $dedupe = $dedupeKey;
        if ($dedupe !== null && $dedupe !== '' && !str_starts_with($dedupe, $this->moduleSlug . ':')) {
            $dedupe = $this->moduleSlug . ':' . $dedupe;
        }
        return $jobs->push($type, $payload, $at, $queue, $priority, $maxAttempts, $dedupe);
    }

    public function cancel(int $jobId): bool
    {
        try {
            $job = $this->db->one('SELECT id, type, status FROM scheduled_jobs WHERE id=?', [$jobId]);
            if (!$job || ($job['status'] ?? '') !== 'pending') {
                return false;
            }
            $type = (string) ($job['type'] ?? '');
            if (!str_starts_with($type, $this->moduleSlug . '.')) {
                return false;
            }
            return (new JobQueue($this->db))->cancel($jobId);
        } catch (\Throwable) {
            return false;
        }
    }

    public function cancelPending(): int
    {
        try {
            return $this->db->run(
                "UPDATE scheduled_jobs
                 SET status='cancelled', finished_at=NOW(),
                     last_error=CONCAT(COALESCE(last_error,''), ' [package_cancel_pending]')
                 WHERE status='pending' AND type LIKE ?",
                [$this->moduleSlug . '.%']
            )->rowCount();
        } catch (\Throwable) {
            return 0;
        }
    }

    public function scheduleCron(
        string $name,
        string $expression,
        string $jobType = '',
        array $payload = [],
        bool $active = true,
    ): void {
        $cronName = $this->cronName($name);
        $type = $this->resolveType($jobType !== '' ? $jobType : $name);
        $expr = trim($expression) !== '' ? trim($expression) : '*/5 * * * *';
        $json = json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) ?: '{}';
        $activeInt = $active ? 1 : 0;
        $next = (new \DateTimeImmutable('now'))->modify('+1 minute')->format('Y-m-d H:i:s');

        $existing = null;
        try {
            $existing = $this->db->one('SELECT id FROM cron_schedules WHERE name=?', [$cronName]);
        } catch (\Throwable) {
            $existing = null;
        }

        if ($existing) {
            $this->db->run(
                'UPDATE cron_schedules SET expression=?, job_type=?, payload=?, is_active=?, next_run_at=COALESCE(next_run_at, ?) WHERE id=?',
                [$expr, $type, $json, $activeInt, $next, (int) $existing['id']]
            );
            return;
        }

        $this->db->run(
            'INSERT INTO cron_schedules (name, expression, job_type, payload, is_active, next_run_at)
             VALUES (?, ?, ?, ?, ?, ?)',
            [$cronName, $expr, $type, $json, $activeInt, $next]
        );
    }

    public function unscheduleCron(string $name): void
    {
        $cronName = $this->cronName($name);
        try {
            $this->db->run('DELETE FROM cron_schedules WHERE name=?', [$cronName]);
        } catch (\Throwable) {
        }
    }

    public function setCronActive(string $name, bool $active): void
    {
        $cronName = $this->cronName($name);
        try {
            $this->db->run(
                'UPDATE cron_schedules SET is_active=? WHERE name=?',
                [$active ? 1 : 0, $cronName]
            );
        } catch (\Throwable) {
        }
    }

    public function releasePackage(): void
    {
        PackageJobLifecycle::release($this->db, $this->moduleSlug);
    }
}
