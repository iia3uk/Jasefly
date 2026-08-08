<?php
declare(strict_types=1);

namespace App\PackageModules\ZedContentProbe;

use App\Platform\Package\AbstractPackageModule;
use App\Platform\PlatformContext;

final class ZedContentProbeModule extends AbstractPackageModule
{
    public function name(): string { return 'zed-content-probe'; }
    public function label(): string { return 'Zed Content Probe'; }

    public function bootPlatform(PlatformContext $ctx): void
    {
        parent::bootPlatform($ctx);
        $ctx->capabilities()->require('content.resources');
        $ctx->resources()->register('zed-items', [
            'permission' => 'content.edit',
            'soft_delete' => true,
            'sitemap' => true,
            'translate' => true,
            'label' => 'Zed items',
        ], new ZedItemHandler($ctx->database()));
        $ctx->events()->publish('zed-content-probe.item.created', ['registered' => true]);
    }
}
