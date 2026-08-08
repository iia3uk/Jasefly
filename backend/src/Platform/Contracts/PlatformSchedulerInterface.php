<?php
declare(strict_types=1);

namespace App\Platform\Contracts;

/**
 * Package-facing scheduler / job queue (shared-hosting pull tick — no daemon required).
 *
 * All job types and cron names are forced into the calling package namespace
 * (`{slug}.{localType}`, cron name `{slug}:{localName}`) so two packages cannot collide.
 */
interface PlatformSchedulerInterface
{
    /**
     * Register a handler for a package-local job type (auto-namespaced).
     *
     * @param callable(array<string, mixed>):void $handler
     */
    public function registerHandler(string $jobType, callable $handler): void;

    /** Unregister one package-local handler (no-op if missing). */
    public function unregisterHandler(string $jobType): void;

    /** Unregister all handlers owned by this package (idempotent). */
    public function unregisterAllHandlers(): void;

    /**
     * Enqueue a job (optionally delayed). Type is auto-namespaced.
     *
     * @param array<string, mixed> $payload
     */
    public function enqueue(string $jobType, array $payload = [], ?int $delaySeconds = null): int;

    /**
     * Enqueue with queue/priority/retry/dedupe controls.
     *
     * @param array<string, mixed> $payload
     */
    public function enqueueEx(
        string $jobType,
        array $payload = [],
        ?int $delaySeconds = null,
        string $queue = 'default',
        int $priority = 0,
        int $maxAttempts = 5,
        ?string $dedupeKey = null,
    ): int;

    /** Cancel a pending job owned by this package. */
    public function cancel(int $jobId): bool;

    /** Cancel all pending jobs in this package namespace. @return int cancelled count */
    public function cancelPending(): int;

    /**
     * Upsert a cron schedule that enqueues a package job on the hosting tick.
     * Expression: hosting-safe subset (every-N-minutes, hourly, …).
     *
     * @param array<string, mixed> $payload
     */
    public function scheduleCron(
        string $name,
        string $expression,
        string $jobType = '',
        array $payload = [],
        bool $active = true,
    ): void;

    /** Deactivate + remove package cron by local name. */
    public function unscheduleCron(string $name): void;

    /** Toggle package cron without deleting the row. */
    public function setCronActive(string $name, bool $active): void;

    /** Fully release package scheduler resources (handlers + pending + crons). */
    public function releasePackage(): void;

    /** Resolved namespaced type for diagnostics / tests. */
    public function resolveType(string $jobType): string;
}
