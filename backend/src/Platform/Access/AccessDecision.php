<?php
declare(strict_types=1);

namespace App\Platform\Access;

final class AccessDecision
{
    /** @param array<string, mixed> $meta */
    public function __construct(
        public readonly bool $allowed,
        public readonly ?string $reason = null,
        public readonly ?string $provider = null,
        public readonly array $meta = [],
    ) {}

    public static function allow(?string $provider = null, array $meta = []): self
    {
        return new self(true, null, $provider, $meta);
    }

    public static function deny(string $reason, ?string $provider = null, array $meta = []): self
    {
        return new self(false, $reason, $provider, $meta);
    }

    /** @return array<string, mixed> */
    public function toArray(): array
    {
        return [
            'allowed' => $this->allowed,
            'reason' => $this->reason,
            'provider' => $this->provider,
            'meta' => $this->meta,
        ];
    }
}
