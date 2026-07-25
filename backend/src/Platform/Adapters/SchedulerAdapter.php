<?php
declare(strict_types=1);

namespace App\Platform\Adapters;

use App\Database;
use App\Modules\Scheduler\JobHandlerRegistry;
use App\Modules\Scheduler\JobQueue;
use App\Platform\Contracts\PlatformJobsInterface;
use App\Platform\Contracts\PlatformSchedulerInterface;

final class SchedulerAdapter implements PlatformSchedulerInterface, PlatformJobsInterface
{
    public function __construct(
        private Database $db,
        private string $moduleSlug,
    ) {}

    public function registerHandler(string $jobType, callable $handler): void
    {
        $type = str_contains($jobType, '.') ? $jobType : $this->moduleSlug . '.' . $jobType;
        JobHandlerRegistry::register($type, $handler);
    }

    public function enqueue(string $jobType, array $payload = [], ?int $delaySeconds = null): int
    {
        $type = str_contains($jobType, '.') ? $jobType : $this->moduleSlug . '.' . $jobType;
        $queue = new JobQueue($this->db);
        $at = $delaySeconds !== null
            ? (new \DateTimeImmutable('now'))->modify('+' . max(0, $delaySeconds) . ' seconds')
            : null;
        return $queue->push($type, $payload, $at);
    }

    public function cancel(int $jobId): bool
    {
        try {
            $this->db->run(
                "UPDATE scheduled_jobs SET status='cancelled' WHERE id=? AND status='pending'",
                [$jobId]
            );
            return true;
        } catch (\Throwable) {
            return false;
        }
    }
}
