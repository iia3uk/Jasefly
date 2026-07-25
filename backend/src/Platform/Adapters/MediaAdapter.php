<?php
declare(strict_types=1);

namespace App\Platform\Adapters;

use App\Database;
use App\Platform\Contracts\PlatformMediaInterface;

final class MediaAdapter implements PlatformMediaInterface
{
    public function __construct(private Database $db) {}

    public function find(int $id): ?array
    {
        try {
            return $this->db->one('SELECT * FROM media WHERE id=? LIMIT 1', [$id]);
        } catch (\Throwable) {
            return null;
        }
    }

    public function url(?int $mediaId): ?string
    {
        if ($mediaId === null || $mediaId <= 0) {
            return null;
        }
        $row = $this->find($mediaId);
        if ($row === null) {
            return null;
        }
        $path = (string) ($row['path'] ?? $row['url'] ?? '');
        if ($path === '') {
            return '/api/v1/media/' . $mediaId;
        }
        return str_starts_with($path, 'http') || str_starts_with($path, '/')
            ? $path
            : '/' . ltrim($path, '/');
    }
}
