<?php
declare(strict_types=1);

namespace App\Platform\Adapters;

use App\Core\EventDispatcher;
use App\Database;
use App\Modules\Scheduler\JobQueue;
use App\Platform\Contracts\PlatformEventsInterface;

final class EventsAdapter implements PlatformEventsInterface
{
    public function __construct(
        private EventDispatcher $events,
        private Database $db,
        private string $moduleSlug,
    ) {}

    public function subscribe(string $event, callable $handler, int $priority = 100): void
    {
        $this->events->subscribe($event, $handler, $priority);
    }

    public function publish(string $event, array $payload = []): void
    {
        $payload['_module'] = $this->moduleSlug;
        $this->events->dispatch($event, $payload);
    }

    public function publishLater(string $event, array $payload, int $delaySeconds): void
    {
        $payload['_module'] = $this->moduleSlug;
        $payload['_platform_event'] = $event;
        try {
            $queue = new JobQueue($this->db);
            $at = (new \DateTimeImmutable('now'))->modify('+' . max(0, $delaySeconds) . ' seconds');
            $queue->push('platform.event.dispatch', $payload, $at);
        } catch (\Throwable) {
            $this->publish($event, $payload);
        }
    }
}
