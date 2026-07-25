<?php
declare(strict_types=1);

namespace App\Platform\Adapters;

use App\Database;
use App\Platform\Contracts\PlatformDatabaseInterface;

final class DatabaseAdapter implements PlatformDatabaseInterface
{
    public function __construct(private Database $db) {}

    public function all(string $sql, array $params = []): array
    {
        return $this->db->all($sql, $params);
    }

    public function one(string $sql, array $params = []): ?array
    {
        return $this->db->one($sql, $params);
    }

    public function run(string $sql, array $params = []): void
    {
        $this->db->run($sql, $params);
    }

    public function lastInsertId(): int
    {
        return (int) $this->db->id();
    }
}
