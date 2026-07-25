<?php
declare(strict_types=1);

namespace App\Platform\Adapters;

use App\Platform\Contracts\PlatformHealthInterface;
use App\Services\Modules\ModuleHealthService;

final class HealthAdapter implements PlatformHealthInterface
{
    /** @var array<string, list<string>> */
    private static array $warningsBySlug = [];

    public function __construct(
        private ?ModuleHealthService $health = null,
        private string $moduleSlug = '',
    ) {}

    public function checkModule(string $slug): array
    {
        $base = ['status' => 'unknown', 'issues' => [], 'warnings' => self::$warningsBySlug[$slug] ?? []];
        if ($this->health === null) {
            $base['issues'][] = 'Health service unavailable';
            return $base;
        }
        $report = $this->health->check($slug);
        $report['warnings'] = array_values(array_unique(array_merge(
            $report['warnings'] ?? [],
            self::$warningsBySlug[$slug] ?? [],
        )));
        return $report;
    }

    public function warn(string $message): void
    {
        $msg = trim($message);
        if ($msg === '' || $this->moduleSlug === '') {
            return;
        }
        self::$warningsBySlug[$this->moduleSlug] ??= [];
        self::$warningsBySlug[$this->moduleSlug][] = $msg;
    }

    public function warnings(): array
    {
        return self::$warningsBySlug[$this->moduleSlug] ?? [];
    }
}
