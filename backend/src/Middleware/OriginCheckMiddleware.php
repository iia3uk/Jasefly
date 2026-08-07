<?php
declare(strict_types=1);

namespace App\Middleware;

use App\Request;
use App\Response;
use App\Support\OriginGuard;

/**
 * Global CSRF defense: reject state-changing /admin/* from disallowed browser Origins.
 * Must run for ALL modules (Content/Media/…), not only SystemModule route stacks.
 * MCP Bearer (mcp_api_token) is exempt even when Origin is present.
 */
final class OriginCheckMiddleware
{
    /** @param array<string, mixed> $app */
    public function __construct(private array $app) {}

    public function __invoke(Request $r, callable $next): mixed
    {
        if (!OriginGuard::requiresCheck($r, $this->app)) {
            return $next();
        }

        $origin = $r->header('Origin');
        $referer = $r->header('Referer');
        if (!OriginGuard::isAllowed(
            is_string($origin) ? $origin : null,
            is_string($referer) ? $referer : null,
            OriginGuard::allowlistFromApp($this->app),
        )) {
            Response::error('Forbidden: invalid Origin', 403, [], ['code' => 'csrf_origin']);
        }

        return $next();
    }
}
