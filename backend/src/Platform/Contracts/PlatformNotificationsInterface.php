<?php
declare(strict_types=1);

namespace App\Platform\Contracts;

interface PlatformNotificationsInterface
{
    /** @param array<string, mixed> $data */
    public function notifyAdmins(string $type, string $title, string $body = '', array $data = []): void;

    /** @param array<string, mixed> $data */
    public function create(int $userId, string $type, string $title, string $body = '', array $data = []): void;
}
