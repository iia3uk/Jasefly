<?php
declare(strict_types=1);

namespace App\Platform\Adapters;

use App\Platform\Contracts\PlatformHealthInterface;
use App\Services\Modules\ModuleHealthService;

final class HealthAdapter implements PlatformHealthInterface
{
    public function __construct(private ?ModuleHealthService $health = null) {}

    public function checkModule(string $slug): array
    {
        if ($this->health === null) {
            return ['status' => 'unknown', 'issues' => ['Health service unavailable'], 'warnings' => []];
        }
        return $this->health->check($slug);
    }
}
