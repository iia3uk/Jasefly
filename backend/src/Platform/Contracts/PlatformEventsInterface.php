<?php
declare(strict_types=1);

namespace App\Platform\Contracts;

interface PlatformEventsInterface
{
    /** @param callable(mixed...):void $handler */
    public function subscribe(string $event, callable $handler, int $priority = 100): void;

    /** @param array<string, mixed> $payload */
    public function publish(string $event, array $payload = []): void;

    /**
     * Queue event for later delivery via scheduler when available.
     * @param array<string, mixed> $payload
     */
    public function publishLater(string $event, array $payload, int $delaySeconds): void;
}
