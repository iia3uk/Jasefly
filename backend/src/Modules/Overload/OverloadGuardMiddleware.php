<?php
declare(strict_types=1);

namespace App\Modules\Overload;

use App\Request;

/**
 * Global middleware: shed public/API traffic with HTTP 503 when load is high.
 */
final class OverloadGuardMiddleware
{
    public function __construct(private OverloadService $service) {}

    public function __invoke(Request $r, callable $next): mixed
    {
        // Never sample/trip on health, webhooks, scheduler, or update pipeline.
        if (str_ends_with($r->path, '/health')
            || str_ends_with($r->path, '/payments/webhook')
            || str_contains($r->path, '/system/scheduler/tick')
            || str_contains($r->path, '/system/update')
            || str_contains($r->path, '/admin/updates')) {
            return $next();
        }

        $isAdminApi = str_contains($r->path, '/admin/') || str_contains($r->path, '/auth/');
        if ($this->service->adminBypass() && $isAdminApi && $r->bearer()) {
            return $next();
        }

        if (!$this->service->evaluateAndMaybeAct()) {
            return $next();
        }

        $preferHtml = $r->method === 'GET'
            && !str_contains((string) ($_SERVER['HTTP_ACCEPT'] ?? ''), 'application/json');
        $this->service->serveUnavailable(preferHtml: $preferHtml);
    }
}
