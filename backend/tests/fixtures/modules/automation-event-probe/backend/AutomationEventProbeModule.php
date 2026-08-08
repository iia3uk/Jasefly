<?php
declare(strict_types=1);

namespace App\PackageModules\AutomationEventProbe;

use App\Platform\Package\AbstractPackageModule;
use App\Platform\PlatformContext;

/**
 * Synthetic probe: declares an unknown product event for Automation discovery tests.
 * Not a product feature.
 */
final class AutomationEventProbeModule extends AbstractPackageModule
{
    public function name(): string
    {
        return 'automation-event-probe';
    }

    public function label(): string
    {
        return 'Automation Event Probe';
    }

    public function priority(): int
    {
        return 212;
    }

    public function bootPlatform(PlatformContext $ctx): void
    {
        parent::bootPlatform($ctx);
        $ctx->capabilities()->require('events.publish');
        $ctx->events()->declare('probe.signal.fired', [
            'label' => 'Probe signal fired',
            'category' => 'probe',
            'payload' => ['signal_id' => 'string'],
        ]);
    }
}
