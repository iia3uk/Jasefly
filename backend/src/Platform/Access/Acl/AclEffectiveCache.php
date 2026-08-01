<?php
declare(strict_types=1);

namespace App\Platform\Access\Acl;

/** Process-local cache of effective capability sets. */
final class AclEffectiveCache
{
    /** @var array<int, array{caps: list<string>, is_super: bool, roles: list<string>, version: string}> */
    private static array $byUser = [];

    public static function get(int $userId): ?array
    {
        return self::$byUser[$userId] ?? null;
    }

    /** @param array{caps: list<string>, is_super: bool, roles: list<string>, version: string} $payload */
    public static function set(int $userId, array $payload): void
    {
        self::$byUser[$userId] = $payload;
    }

    public static function forget(?int $userId = null): void
    {
        if ($userId === null) {
            self::$byUser = [];
            return;
        }
        unset(self::$byUser[$userId]);
    }
}
