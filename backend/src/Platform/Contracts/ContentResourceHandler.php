<?php
declare(strict_types=1);

namespace App\Platform\Contracts;

/**
 * Package-owned implementation for one opaque content resource type.
 * The platform owns registration and dispatch only; persistence semantics
 * (including public visibility) remain with the resource owner.
 */
interface ContentResourceHandler
{
    public function list(array $query): array;

    public function get(int|string $idOrSlug, array $opts = []): ?array;

    public function create(array $data, ?array $user): array;

    public function update(int|string $id, array $data, ?array $user): array;

    public function delete(int|string $id, ?array $user): array;

    public function publish(int|string $id, string $status, ?array $user): array;

    public function relations(int|string $id, string $relation): array;

    public function replaceRelations(int|string $id, string $relation, array $rows, ?array $user): array;

    public function publicList(array $query): array;

    public function publicGet(string $slug): ?array;
}
