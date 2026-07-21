<?php
declare(strict_types=1);
namespace App\Utils;
final class Security {
    public static function csrf(): string { if(session_status()!==PHP_SESSION_ACTIVE) session_start(); return $_SESSION['csrf'] ??= bin2hex(random_bytes(32)); }
    public static function verifyCsrf(?string $token): bool { return session_status()===PHP_SESSION_ACTIVE && hash_equals($_SESSION['csrf'] ?? '',$token ?? ''); }
    public static function sanitize(string $v): string { return trim(strip_tags($v)); } public static function escape(string $v): string { return htmlspecialchars($v,ENT_QUOTES|ENT_SUBSTITUTE,'UTF-8'); }
}
