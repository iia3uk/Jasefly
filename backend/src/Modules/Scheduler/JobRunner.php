<?php
declare(strict_types=1);

namespace App\Modules\Scheduler;

use App\Core\Container;
use App\Core\EventDispatcher;
use App\Database;

final class JobRunner
{
    public function __construct(
        private Database $db,
        private int $staleSeconds = 900
    ) {}

    /**
     * @return array{processed:int, completed:int, failed:int, recovered:int}
     */
    public function run(int $limit = 20, int $timeBudgetSec = 20): array
    {
        $limit = max(1, min(100, $limit));
        $deadline = microtime(true) + max(1, $timeBudgetSec);
        $stats = ['processed' => 0, 'completed' => 0, 'failed' => 0, 'recovered' => 0];

        $stats['recovered'] = $this->recoverStale();

        while ($stats['processed'] < $limit && microtime(true) < $deadline) {
            $job = $this->claimOne();
            if (!$job) {
                break;
            }
            $stats['processed']++;
            if ($this->execute($job)) {
                $stats['completed']++;
            } else {
                $stats['failed']++;
            }
        }

        $this->setMeta('last_tick_at', gmdate('Y-m-d H:i:s'));
        return $stats;
    }

    private function recoverStale(): int
    {
        try {
            return $this->db->run(
                "UPDATE scheduled_jobs SET status='pending', available_at=NOW(), last_error=CONCAT(COALESCE(last_error,''), ' [stale recovery]')
                 WHERE status='running' AND started_at < DATE_SUB(NOW(), INTERVAL ? SECOND)",
                [$this->staleSeconds]
            )->rowCount();
        } catch (\Throwable) {
            return 0;
        }
    }

    /** @return array<string, mixed>|null */
    private function claimOne(): ?array
    {
        $pdo = $this->db->pdo();
        try {
            $pdo->beginTransaction();
            $job = $this->db->one(
                "SELECT * FROM scheduled_jobs
                 WHERE status='pending' AND available_at <= NOW()
                 ORDER BY priority DESC, id ASC
                 LIMIT 1 FOR UPDATE"
            );
            if (!$job) {
                $pdo->commit();
                return null;
            }
            $this->db->run(
                "UPDATE scheduled_jobs SET status='running', started_at=NOW(), attempts=attempts+1 WHERE id=?",
                [(int) $job['id']]
            );
            $pdo->commit();
            $job['attempts'] = (int) $job['attempts'] + 1;
            $job['status'] = 'running';
            return $job;
        } catch (\Throwable) {
            if ($pdo->inTransaction()) {
                try {
                    $pdo->rollBack();
                } catch (\Throwable) {
                }
            }
            // Fallback without FOR UPDATE (sqlite / hosting quirks)
            $job = $this->db->one(
                "SELECT * FROM scheduled_jobs WHERE status='pending' AND available_at <= NOW() ORDER BY priority DESC, id ASC LIMIT 1"
            );
            if (!$job) {
                return null;
            }
            $n = $this->db->run(
                "UPDATE scheduled_jobs SET status='running', started_at=NOW(), attempts=attempts+1 WHERE id=? AND status='pending'",
                [(int) $job['id']]
            )->rowCount();
            if ($n < 1) {
                return null;
            }
            $job['attempts'] = (int) $job['attempts'] + 1;
            return $job;
        }
    }

    /** @param array<string, mixed> $job */
    private function execute(array $job): bool
    {
        $id = (int) $job['id'];
        $type = (string) $job['type'];
        $attempt = (int) $job['attempts'];
        $payload = json_decode((string) ($job['payload'] ?? '{}'), true);
        if (!is_array($payload)) {
            $payload = [];
        }

        $this->dispatch('scheduler.job.started', ['job_id' => $id, 'type' => $type]);
        $t0 = microtime(true);

        try {
            $owner = JobHandlerRegistry::ownerOf($type);
            if ($owner !== null && !$this->isOwnerActive($owner)) {
                $ms = (int) round((microtime(true) - $t0) * 1000);
                $err = 'owner_inactive:' . $owner;
                $this->db->run(
                    "UPDATE scheduled_jobs SET status='cancelled', finished_at=NOW(), last_error=? WHERE id=?",
                    [$err, $id]
                );
                $this->logAttempt($id, $attempt, 'cancelled', $err, $ms);
                $this->dispatch('scheduler.job.cancelled', ['job_id' => $id, 'type' => $type, 'reason' => 'owner_inactive']);
                return false;
            }

            $handler = JobHandlerRegistry::get($type);
            if (!$handler) {
                // Orphan / unregistered — cancel without retry burn (package disable/uninstall).
                $ms = (int) round((microtime(true) - $t0) * 1000);
                $err = 'no_handler:' . $type;
                $this->db->run(
                    "UPDATE scheduled_jobs SET status='cancelled', finished_at=NOW(), last_error=? WHERE id=?",
                    [$err, $id]
                );
                $this->logAttempt($id, $attempt, 'cancelled', $err, $ms);
                $this->dispatch('scheduler.job.cancelled', ['job_id' => $id, 'type' => $type, 'reason' => 'no_handler']);
                return false;
            }
            $handler($payload);
            $ms = (int) round((microtime(true) - $t0) * 1000);
            $this->db->run(
                "UPDATE scheduled_jobs SET status='completed', finished_at=NOW(), last_error=NULL WHERE id=?",
                [$id]
            );
            $this->logAttempt($id, $attempt, 'completed', null, $ms);
            $this->dispatch('scheduler.job.completed', ['job_id' => $id, 'type' => $type, 'duration_ms' => $ms]);
            return true;
        } catch (\Throwable $e) {
            $ms = (int) round((microtime(true) - $t0) * 1000);
            $err = mb_substr($e->getMessage(), 0, 2000);
            $max = (int) ($job['max_attempts'] ?? 5);
            if ($attempt >= $max) {
                $this->db->run(
                    "UPDATE scheduled_jobs SET status='failed', finished_at=NOW(), last_error=? WHERE id=?",
                    [$err, $id]
                );
                $this->logAttempt($id, $attempt, 'failed', $err, $ms);
                $this->dispatch('scheduler.job.failed', ['job_id' => $id, 'type' => $type, 'error' => $err]);
            } else {
                $delay = $this->backoffSeconds($attempt);
                $this->db->run(
                    "UPDATE scheduled_jobs SET status='pending', available_at=DATE_ADD(NOW(), INTERVAL ? SECOND), last_error=?, started_at=NULL WHERE id=?",
                    [$delay, $err, $id]
                );
                $this->logAttempt($id, $attempt, 'retry', $err, $ms);
            }
            return false;
        }
    }

    private function backoffSeconds(int $attempt): int
    {
        return min(3600, (int) (2 ** max(0, $attempt - 1)) * 5);
    }

    /**
     * Platform/infra owners stay active. Package owners follow modules.is_enabled.
     * Missing modules row → fail-open (bundled core plugins without a row).
     */
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

    private function logAttempt(int $jobId, int $attempt, string $status, ?string $error, int $ms): void
    {
        try {
            $this->db->run(
                'INSERT INTO job_attempts (job_id, attempt, status, error, duration_ms) VALUES (?, ?, ?, ?, ?)',
                [$jobId, $attempt, $status, $error, $ms]
            );
        } catch (\Throwable) {
        }
    }

    public function setMeta(string $key, ?string $value): void
    {
        try {
            $this->db->run(
                'INSERT INTO scheduler_meta (meta_key, meta_value) VALUES (?, ?)
                 ON DUPLICATE KEY UPDATE meta_value=VALUES(meta_value)',
                [$key, $value]
            );
        } catch (\Throwable) {
            try {
                $this->db->run(
                    'INSERT INTO scheduler_meta (meta_key, meta_value) VALUES (?, ?)
                     ON CONFLICT(meta_key) DO UPDATE SET meta_value=excluded.meta_value',
                    [$key, $value]
                );
            } catch (\Throwable) {
            }
        }
    }

    public function getMeta(string $key): ?string
    {
        try {
            $row = $this->db->one('SELECT meta_value FROM scheduler_meta WHERE meta_key=?', [$key]);
            return $row ? (isset($row['meta_value']) ? (string) $row['meta_value'] : null) : null;
        } catch (\Throwable) {
            return null;
        }
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
