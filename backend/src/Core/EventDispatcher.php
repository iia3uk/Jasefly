<?php
declare(strict_types=1);

namespace App\Core;

/**
 * Minimal in-process event/hook dispatcher.
 *
 * Plugins subscribe to named events during boot() and dispatch them
 * from anywhere (controllers, services, other plugins). Hooks are
 * synchronous, ordered by subscription priority.
 *
 * Core events (dispatched by the kernel):
 *   - module.boot             after registry boot
 *   - resource.beforeSave     {table, data, id|null}
 *   - resource.afterSave      {table, data, id}
 *   - resource.beforeDelete   {table, id}
 *   - resource.afterDelete    {table, id}
 *   - page.beforePublish      {pageId, layout}
 *   - page.afterPublish       {pageId}
 *   - search.index            {type, id, payload}  -> mutate payload
 *   - migration.after         {applied: string[]}
 *
 * A subscriber may return a value for filter-style events; the last
 * non-null return wins and replaces the payload for the next subscriber.
 */
final class EventDispatcher
{
    /** @var array<string, list<array{priority:int, callable}>> */
    private array $subscribers = [];

    public function subscribe(string $event, callable $handler, int $priority = 0): void
    {
        $this->subscribers[$event][] = ['priority' => $priority, 'handler' => $handler];
        usort(
            $this->subscribers[$event],
            static fn(array $a, array $b) => $a['priority'] <=> $b['priority']
        );
    }

    /**
     * Notify subscribers. For filter events, the returned payload is
     * passed forward to the next subscriber.
     *
     * @param string $event
     * @param mixed $payload
     * @return mixed The (possibly mutated) payload.
     */
    public function dispatch(string $event, mixed $payload = null): mixed
    {
        foreach ($this->subscribers[$event] ?? [] as $sub) {
            try {
                $result = ($sub['handler'])($payload);
                if ($result !== null) {
                    $payload = $result;
                }
            } catch (\Throwable $e) {
                // One broken subscriber must not abort the publisher (forms, payments, …).
                @error_log('EventDispatcher[' . $event . ']: ' . $e->getMessage());
            }
        }
        return $payload;
    }

    public function hasSubscribers(string $event): bool
    {
        return !empty($this->subscribers[$event]);
    }

    /** @return list<string> */
    public function events(): array
    {
        return array_keys($this->subscribers);
    }
}
