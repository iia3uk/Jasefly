<?php
declare(strict_types=1);

namespace App\Platform\Contracts;

interface PlatformMediaInterface
{
    /** @return array<string, mixed>|null */
    public function find(int $id): ?array;

    public function url(?int $mediaId): ?string;
}
