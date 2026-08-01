<?php
declare(strict_types=1);

namespace App\Platform\Access;

final class AccessProviderRegistry
{
    /** @var array<string, AccessProviderInterface> */
    private array $providers = [];

    public function register(AccessProviderInterface $provider): void
    {
        $id = trim($provider->id());
        if ($id === '') {
            throw new \InvalidArgumentException('Access provider id must not be empty');
        }
        $this->providers[$id] = $provider;
    }

    public function get(string $id): ?AccessProviderInterface
    {
        return $this->providers[$id] ?? null;
    }

    /** @return list<AccessProviderInterface> */
    public function all(): array
    {
        return array_values($this->providers);
    }

    public function has(string $id): bool
    {
        return isset($this->providers[$id]);
    }
}
