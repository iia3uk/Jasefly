<?php
declare(strict_types=1);

namespace App\Platform\Contracts;

interface PlatformSchedulerInterface
{
    /** @param callable(array<string, mixed>):void $handler */
    public function registerHandler(string $jobType, callable $handler): void;

    /** @param array<string, mixed> $payload */
    public function enqueue(string $jobType, array $payload = [], ?int $delaySeconds = null): int;

    public function cancel(int $jobId): bool;
}
