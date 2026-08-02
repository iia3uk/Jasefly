<?php
declare(strict_types=1);

namespace App\Modules\Demo;

/** Request-scoped demo sandbox identity. Never trust client site_id / user_id. */
final class DemoContext
{
    public function __construct(
        public readonly string $sessionId,
        public readonly int $userId = -1,
        public readonly bool $isDemo = true,
        public readonly string $sandboxNamespace = 'demo',
        public readonly ?int $expiresAt = null,
        public readonly bool $ephemeral = true,
    ) {}
}
