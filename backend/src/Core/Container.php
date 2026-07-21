<?php
declare(strict_types=1);

namespace App\Core;

/**
 * Simple service locator for module constructors.
 * Prefer constructor injection of Database + config array in modules.
 */
final class Container
{
    private static ?self $instance = null;

    /** @var array<string, mixed> */
    private array $bindings = [];

    public static function getInstance(): self
    {
        return self::$instance ??= new self();
    }

    public function set(string $id, mixed $value): void
    {
        $this->bindings[$id] = $value;
    }

    public function get(string $id): mixed
    {
        if (!array_key_exists($id, $this->bindings)) {
            throw new \RuntimeException("Service not found: $id");
        }
        return $this->bindings[$id];
    }

    public function has(string $id): bool
    {
        return array_key_exists($id, $this->bindings);
    }
}
