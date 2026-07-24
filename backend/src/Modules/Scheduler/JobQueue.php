<?php
declare(strict_types=1);

namespace App\Modules\Scheduler;

use App\Core\Container;
use App\Core\EventDispatcher;
use App\Database;

final class JobQueue
{
    public function __construct(private Database $db) {}

    /**
     * @param array<string, mixed> $payload
     */
    public function push(
        string $type,
        array $payload = [],
        ?\DateTimeInterface $availableAt = null,
        string $queue = 'default',
        int $priority = 0,
        int $maxAttempts = 5,
        ?string $dedupeKey = null
    ): int {
        $when = ($availableAt ?? new \DateTimeImmutable('now'))->format('Y-m-d H:i:s');
        $json = json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) ?: '{}';

        if ($dedupeKey !== null && $dedupeKey !== '') {
            $existing = $this->db->one(
                "SELECT id FROM scheduled_jobs WHERE deduplication_key = ? AND status IN ('pending','running') LIMIT 1",
                [$dedupeKey]
            );
            if ($existing) {
                return (int) $existing['id'];
            }
        }

        try {
            $this->db->run(
                'INSERT INTO scheduled_jobs (type, payload, queue, priority, status, available_at, max_attempts, deduplication_key)
                 VALUES (?, ?, ?, ?, \'pending\', ?, ?, ?)',
                [$type, $json, $queue, $priority, $when, $maxAttempts, $dedupeKey]
            );
        } catch (\Throwable $e) {
            if ($dedupeKey) {
                $row = $this->db->one(
                    'SELECT id FROM scheduled_jobs WHERE deduplication_key = ? LIMIT 1',
                    [$dedupeKey]
                );
                if ($row) {
                    return (int) $row['id'];
                }
            }
            throw $e;
        }

        $id = (int) $this->db->id();
        $this->dispatch('scheduler.job.created', ['job_id' => $id, 'type' => $type, 'queue' => $queue]);
        return $id;
    }

    public function delay(string $type, array $payload, int $seconds, ?string $dedupeKey = null): int
    {
        $at = (new \DateTimeImmutable('now'))->modify('+' . max(0, $seconds) . ' seconds');
        return $this->push($type, $payload, $at, 'default', 0, 5, $dedupeKey);
    }

    public function cancel(int $id): bool
    {
        $n = $this->db->run(
            "UPDATE scheduled_jobs SET status='cancelled', finished_at=NOW() WHERE id=? AND status IN ('pending')",
            [$id]
        )->rowCount();
        if ($n > 0) {
            $this->dispatch('scheduler.job.cancelled', ['job_id' => $id]);
            return true;
        }
        return false;
    }

    public function retry(int $id): bool
    {
        $job = $this->db->one('SELECT * FROM scheduled_jobs WHERE id=?', [$id]);
        if (!$job || !in_array($job['status'], ['failed', 'cancelled'], true)) {
            return false;
        }
        $this->db->run(
            "UPDATE scheduled_jobs SET status='pending', available_at=NOW(), last_error=NULL, started_at=NULL, finished_at=NULL WHERE id=?",
            [$id]
        );
        $this->dispatch('scheduler.job.created', ['job_id' => $id, 'type' => $job['type'], 'retry' => true]);
        return true;
    }

    private function dispatch(string $event, array $payload): void
    {
        try {
            $c = Container::getInstance();
            if ($c->has(EventDispatcher::class)) {
                $c->get(EventDispatcher::class)->dispatch($event, $payload);
            }
        } catch (\Throwable) {
        }
    }
}
