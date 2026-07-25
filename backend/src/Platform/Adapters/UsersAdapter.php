<?php
declare(strict_types=1);

namespace App\Platform\Adapters;

use App\Database;
use App\Platform\Contracts\PlatformUsersInterface;

final class UsersAdapter implements PlatformUsersInterface
{
    public function __construct(private Database $db) {}

    public function findById(int $id): ?array
    {
        return $this->db->one('SELECT id, email, name, role, created_at FROM users WHERE id=? LIMIT 1', [$id]);
    }

    public function findByEmail(string $email): ?array
    {
        return $this->db->one('SELECT id, email, name, role, created_at FROM users WHERE email=? LIMIT 1', [$email]);
    }

    public function rolesFor(int $userId): array
    {
        $row = $this->findById($userId);
        if ($row === null) {
            return [];
        }
        $role = (string) ($row['role'] ?? '');
        return $role !== '' ? [$role] : [];
    }
}
