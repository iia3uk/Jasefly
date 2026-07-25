<?php
declare(strict_types=1);

namespace App\Platform\Adapters;

use App\Database;
use App\Modules\Notifications\NotificationService;
use App\Platform\Contracts\PlatformNotificationsInterface;

final class NotificationsAdapter implements PlatformNotificationsInterface
{
    private NotificationService $inner;

    public function __construct(Database $db)
    {
        $this->inner = new NotificationService($db);
    }

    public function notifyAdmins(string $type, string $title, string $body = '', array $data = []): void
    {
        $this->inner->notifyAdmins($type, $title, $body, $data);
    }

    public function create(int $userId, string $type, string $title, string $body = '', array $data = []): void
    {
        $this->inner->create($userId, $type, $title, $body, $data);
    }
}
