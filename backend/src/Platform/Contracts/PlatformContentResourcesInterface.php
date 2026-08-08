<?php
declare(strict_types=1);

namespace App\Platform\Contracts;

/**
 * Registry and dispatch surface for package/host-owned content projections.
 * Resource type strings are opaque to Core.
 */
interface PlatformContentResourcesInterface
{
    public function register(string $type, array $definition, object|array $handler): void;

    public function clearOwner(string $ownerSlug): void;

    public function has(string $type): bool;

    public function owner(string $type): ?string;

    /** @return list<array{type:string,owner:?string,meta:array}> */
    public function types(): array;

    /** @return array<string,mixed>|null */
    public function definition(string $type): ?array;

    /** @return array{items:list<array<string,mixed>>,total?:int}|array<string,mixed> */
    public function list(string $type, array $query = []): array;

    /** @return array<string,mixed>|null */
    public function get(string $type, int|string $idOrSlug, array $opts = []): ?array;

    /** @return array<string,mixed> */
    public function create(string $type, array $data, ?array $user = null): array;

    /** @return array<string,mixed> */
    public function update(string $type, int|string $id, array $data, ?array $user = null): array;

    /** @return array<string,mixed> */
    public function delete(string $type, int|string $id, ?array $user = null): array;

    /** @return array<string,mixed> */
    public function publish(string $type, int|string $id, string $status, ?array $user = null): array;

    /** @return array<string,mixed> */
    public function relations(string $type, int|string $id, string $relation): array;

    /** @return array<string,mixed> */
    public function replaceRelations(string $type, int|string $id, string $relation, array $rows, ?array $user = null): array;

    /** @return array{items:list<array<string,mixed>>,total?:int}|array<string,mixed> */
    public function publicList(string $type, array $query = []): array;

    /** @return array<string,mixed>|null */
    public function publicGet(string $type, string $slug): ?array;
}
