<?php
declare(strict_types=1);

namespace App\Services\Modules;

/**
 * Stable reason codes for module quarantine (universal protection, not only exceptions).
 */
final class ModuleQuarantineReason
{
    public const EXCEPTION = 'exception';
    public const BOOTSTRAP_TIMEOUT = 'bootstrap_timeout';
    public const MEMORY_LIMIT = 'memory_limit';
    public const ROUTE_CONFLICT = 'route_conflict';
    public const MISSING_DEPENDENCY = 'missing_dependency';
    public const SDK_INCOMPATIBLE = 'sdk_incompatible';
    public const MIGRATION_FAILED = 'migration_failed';
    public const ENTRYPOINT_UNSAFE = 'entrypoint_unsafe';
    public const INVALID_MANIFEST = 'invalid_manifest';

    /** @return list<string> */
    public static function all(): array
    {
        return [
            self::EXCEPTION,
            self::BOOTSTRAP_TIMEOUT,
            self::MEMORY_LIMIT,
            self::ROUTE_CONFLICT,
            self::MISSING_DEPENDENCY,
            self::SDK_INCOMPATIBLE,
            self::MIGRATION_FAILED,
            self::ENTRYPOINT_UNSAFE,
            self::INVALID_MANIFEST,
        ];
    }
}
