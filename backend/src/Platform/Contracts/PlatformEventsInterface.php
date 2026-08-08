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

    /**
     * Declare a public event for discovery (Automation triggers, docs).
     * Metadata only — does not publish or deliver. Owner is forced to the calling package slug.
     *
     * @param array{label?:string, category?:string, payload?:array<string,mixed>} $meta
     */
    public function declare(string $eventId, array $meta = []): void;

    /** Whether any package currently declares this public event id. */
    public function hasDeclared(string $eventId): bool;

    /**
     * @return list<array{id:string, owner:string, label:string, category:string, payload:array<string,mixed>}>
     */
    public function listDeclared(): array;
}
