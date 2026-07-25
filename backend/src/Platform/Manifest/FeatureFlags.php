<?php
declare(strict_types=1);

namespace App\Platform\Manifest;

final class FeatureFlags
{
    /** @param array<string, bool> $flags */
    public function __construct(private array $flags = [])
    {
        $defaults = [
            'builder.widgets' => true,
            'builder.inspector' => true,
            'builder.toolbar' => true,
            'admin.dashboard_cards' => true,
            'admin.search_providers' => true,
            'public.routes' => true,
            'events.delay' => true,
            'scheduler.jobs' => true,
            'sdk.v2' => true,
            'capabilities.resolve' => true,
        ];
        $this->flags = array_merge($defaults, $flags);
    }

    public function enabled(string $flag): bool
    {
        return (bool) ($this->flags[$flag] ?? false);
    }

    /** @return array<string, bool> */
    public function all(): array
    {
        return $this->flags;
    }
}
