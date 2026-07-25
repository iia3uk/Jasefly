<?php
declare(strict_types=1);

namespace App\Platform\Capabilities;

/**
 * Resolves platform services by id / capability for package modules.
 */
final class ServiceRegistry
{
    /** @var array<string, object> */
    private array $services = [];

    public function set(string $id, object $service): void
    {
        $this->services[$id] = $service;
    }

    public function get(string $id): ?object
    {
        return $this->services[$id] ?? null;
    }

    public function require(string $id): object
    {
        $svc = $this->get($id);
        if ($svc === null) {
            throw new \RuntimeException('Platform service not registered: ' . $id);
        }
        return $svc;
    }

    /** @return list<string> */
    public function ids(): array
    {
        return array_keys($this->services);
    }
}
