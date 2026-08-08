<?php
declare(strict_types=1);

namespace App\Platform\Adapters;

use App\Platform\Contracts\ContentResourceHandler;
use App\Platform\Contracts\PlatformContentResourcesInterface;

/**
 * Static process-local registry. Package lifecycle clears registrations by
 * owner, so disabled/uninstalled code can no longer serve projections.
 */
final class ContentResourcesAdapter implements PlatformContentResourcesInterface
{
    /** @var array<string,array{owner:?string,definition:array<string,mixed>,handler:object|array}> */
    private static array $registry = [];

    public function __construct(private string $ownerSlug = '') {}

    public function register(string $type, array $definition, object|array $handler): void
    {
        $type = trim($type);
        $owner = trim($this->ownerSlug);
        if ($type === '' || $owner === '') {
            throw new \RuntimeException('content resources registration requires a type and package slug context');
        }
        if (!$handler instanceof ContentResourceHandler && !is_array($handler)) {
            throw new \InvalidArgumentException('content resource handler must implement ContentResourceHandler or provide operation callables');
        }
        if (isset(self::$registry[$type]) && self::$registry[$type]['owner'] !== $owner) {
            throw new \RuntimeException("content resource type '{$type}' is already owned by another package");
        }
        $definition['owner'] = $owner;
        self::$registry[$type] = ['owner' => $owner, 'definition' => $definition, 'handler' => $handler];
    }

    public function clearOwner(string $ownerSlug): void
    {
        self::clearOwnerRegistrations($ownerSlug);
    }

    public static function clearOwnerRegistrations(string $ownerSlug): void
    {
        $ownerSlug = trim($ownerSlug);
        foreach (self::$registry as $type => $entry) {
            if ($ownerSlug !== '' && $entry['owner'] === $ownerSlug) {
                unset(self::$registry[$type]);
            }
        }
    }

    public static function resetForTests(): void
    {
        self::$registry = [];
    }

    public function has(string $type): bool
    {
        return isset(self::$registry[trim($type)]);
    }

    public function owner(string $type): ?string
    {
        return self::$registry[trim($type)]['owner'] ?? null;
    }

    public function types(): array
    {
        $types = [];
        foreach (self::$registry as $type => $entry) {
            $types[] = ['type' => $type, 'owner' => $entry['owner'], 'meta' => $entry['definition']];
        }
        return $types;
    }

    public function definition(string $type): ?array
    {
        return self::$registry[trim($type)]['definition'] ?? null;
    }

    public function list(string $type, array $query = []): array
    {
        return $this->call($type, 'list', [$query], ['items' => []]);
    }

    public function get(string $type, int|string $idOrSlug, array $opts = []): ?array
    {
        $result = $this->call($type, 'get', [$idOrSlug, $opts], null);
        return is_array($result) ? $result : null;
    }

    public function create(string $type, array $data, ?array $user = null): array
    {
        return $this->call($type, 'create', [$data, $user], $this->unknown($type));
    }

    public function update(string $type, int|string $id, array $data, ?array $user = null): array
    {
        return $this->call($type, 'update', [$id, $data, $user], $this->unknown($type));
    }

    public function delete(string $type, int|string $id, ?array $user = null): array
    {
        return $this->call($type, 'delete', [$id, $user], $this->unknown($type));
    }

    public function publish(string $type, int|string $id, string $status, ?array $user = null): array
    {
        return $this->call($type, 'publish', [$id, $status, $user], $this->unknown($type));
    }

    public function relations(string $type, int|string $id, string $relation): array
    {
        return $this->call($type, 'relations', [$id, $relation], []);
    }

    public function replaceRelations(string $type, int|string $id, string $relation, array $rows, ?array $user = null): array
    {
        return $this->call($type, 'replaceRelations', [$id, $relation, $rows, $user], $this->unknown($type));
    }

    public function publicList(string $type, array $query = []): array
    {
        return $this->call($type, 'publicList', [$query], ['items' => []]);
    }

    public function publicGet(string $type, string $slug): ?array
    {
        $result = $this->call($type, 'publicGet', [$slug], null);
        return is_array($result) ? $result : null;
    }

    private function call(string $type, string $operation, array $arguments, mixed $fallback): mixed
    {
        $entry = self::$registry[trim($type)] ?? null;
        if ($entry === null) {
            return $fallback;
        }
        $handler = $entry['handler'];
        try {
            if ($handler instanceof ContentResourceHandler) {
                return $handler->{$operation}(...$arguments);
            }
            $callable = $handler[$operation] ?? null;
            if (!is_callable($callable)) {
                throw new \RuntimeException("content resource handler does not implement '{$operation}'");
            }
            return $callable(...$arguments);
        } catch (\Throwable $e) {
            if (in_array($operation, ['get', 'publicGet'], true)) {
                return null;
            }
            return ['ok' => false, 'code' => 'resource_error', 'error' => $e->getMessage()];
        }
    }

    /** @return array{ok:false,code:string,error:string} */
    private function unknown(string $type): array
    {
        return ['ok' => false, 'code' => 'unknown_resource', 'error' => 'Unknown content resource: ' . trim($type)];
    }
}
