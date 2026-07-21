<?php
declare(strict_types=1);

namespace App\Utils;

/**
 * Password hashing — always Argon2id when available, else PASSWORD_DEFAULT.
 */
final class Password
{
    public static function algo(): string|int
    {
        if (defined('PASSWORD_ARGON2ID')) {
            return PASSWORD_ARGON2ID;
        }
        return PASSWORD_DEFAULT;
    }

    public static function hash(string $plain): string
    {
        return password_hash($plain, self::algo());
    }

    public static function verify(string $plain, string $hash): bool
    {
        return password_verify($plain, $hash);
    }

    /** Rehash with current algo if the stored hash is outdated. */
    public static function needsRehash(string $hash): bool
    {
        return password_needs_rehash($hash, self::algo());
    }
}
