<?php
declare(strict_types=1);

namespace App\Services\Modules;

/**
 * Thrown by ModuleQuarantinePolicy / Router when a package must be isolated.
 */
final class ModuleQuarantineViolation extends \RuntimeException
{
    public function __construct(
        public readonly string $reason,
        string $message,
        public readonly string $stage = 'policy',
        ?\Throwable $previous = null,
    ) {
        parent::__construct($message, 0, $previous);
    }
}
