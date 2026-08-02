<?php
declare(strict_types=1);

namespace App\Modules\Demo;

use App\Request;
use App\Response;

/**
 * Global middleware: bind DemoContext and fail-closed isolate admin API.
 */
final class DemoGuardMiddleware
{
    public function __construct(
        private DemoSessionService $sessions,
        private DemoSandboxGateway $gateway,
    ) {}

    public function __invoke(Request $r, callable $next): mixed
    {
        $ctx = $this->sessions->resolveFromRequest($r);
        if ($ctx === null) {
            DemoContextHolder::clear();
            return $next();
        }

        DemoContextHolder::set($ctx);

        // Attach synthetic user for downstream Auth/Permission if not set
        if ($r->user === null || (($r->user['type'] ?? '') !== 'demo_access' && empty($r->user['is_demo']))) {
            $r->user = [
                'sub' => DemoSessionService::DEMO_USER_ID,
                'id' => DemoSessionService::DEMO_USER_ID,
                'name' => 'Demo Explorer',
                'email' => 'demo@jasefly.local',
                'role' => 'demo_explorer',
                'type' => 'demo_access',
                'is_demo' => true,
                'demo_sid' => $ctx->sessionId,
                'auth' => 'demo',
            ];
        }

        $mode = DemoRoutePolicy::decide($r->method, $r->path);
        $norm = DemoRoutePolicy::normalizePath($r->path);

        // Auth demo endpoints + /auth/me continue to controllers
        if ($mode === DemoRoutePolicy::PASS) {
            return $next();
        }

        // Any admin (or other) path under demo session goes through gateway or deny
        if ($mode === DemoRoutePolicy::DENY) {
            $this->sessions->audit($ctx->sessionId, 'deny', $norm, ['method' => $r->method]);
            Response::error('Demo restricted', 403, [], ['code' => 'demo_restricted']);
        }

        // interactive + preview → sandbox gateway (never production handlers)
        $this->gateway->handle($r, $ctx, $mode);
    }
}
