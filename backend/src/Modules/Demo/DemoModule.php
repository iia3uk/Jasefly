<?php
declare(strict_types=1);

namespace App\Modules\Demo;

use App\Core\AbstractModule;
use App\Database;
use App\Middleware\RateLimitMiddleware;
use App\Request;
use App\Response;
use App\Router;

/**
 * Public Demo Sandbox — isolated Admin/Builder experience.
 * Always enabled (core safety surface); not a toggleable content plugin.
 */
final class DemoModule extends AbstractModule
{
    public function name(): string
    {
        return 'demo';
    }

    public function label(): string
    {
        return 'Demo Sandbox';
    }

    public function priority(): int
    {
        return 12;
    }

    public function enabled(array $app): bool
    {
        return true;
    }

    public function globalMiddleware(Database $db, array $app): array
    {
        $bundle = $this->services($db, $app);
        return [new DemoGuardMiddleware($bundle['sessions'], $bundle['gateway'])];
    }

    public function registerRoutes(Router $router, Database $db, array $app, string $apiPrefix): void
    {
        $p = fn(string $path) => rtrim($apiPrefix, '/') . $path;
        $bundle = fn() => $this->services($db, $app);
        $rate = [new RateLimitMiddleware($db, 5, 900, true)];

        $router->post($p('/auth/demo/start'), function (Request $r) use ($bundle) {
            try {
                $data = $bundle()['sessions']->start($r);
                // Keep access_token intact; redact only nested user/meta fields.
                $token = $data['access_token'] ?? null;
                $safe = DemoResponseSanitizer::sanitize($data);
                if (is_string($token) && $token !== '') {
                    $safe['access_token'] = $token;
                }
                Response::json(['data' => $safe]);
            } catch (\Throwable $e) {
                Response::error('Cannot start demo session: ' . $e->getMessage(), 503, [], ['code' => 'demo_unavailable']);
            }
        }, $rate);

        $router->post($p('/auth/demo/reset'), function (Request $r) use ($bundle) {
            $svc = $bundle()['sessions'];
            $ctx = $svc->resolveFromRequest($r);
            if ($ctx === null) {
                Response::error('Unauthorized', 401, [], ['code' => 'demo_unauthorized']);
            }
            DemoContextHolder::set($ctx);
            $svc->reset($ctx->sessionId);
            Response::json(['data' => ['ok' => true, 'is_demo' => true]]);
        });

        $router->post($p('/auth/demo/end'), function (Request $r) use ($bundle) {
            $svc = $bundle()['sessions'];
            $ctx = $svc->resolveFromRequest($r);
            if ($ctx === null) {
                DemoCookie::clear();
                Response::json(['data' => ['ok' => true]]);
            }
            $svc->end($ctx->sessionId);
            DemoContextHolder::clear();
            Response::json(['data' => ['ok' => true]]);
        });

        $router->get($p('/admin/demo/bootstrap'), function (Request $r) use ($bundle) {
            $svc = $bundle()['sessions'];
            $ctx = $svc->resolveFromRequest($r);
            if ($ctx === null) {
                Response::error('Unauthorized', 401, [], ['code' => 'demo_unauthorized']);
            }
            DemoContextHolder::set($ctx);
            $bundle()['gateway']->handle($r, $ctx, DemoRoutePolicy::INTERACTIVE);
        });

        $router->post($p('/admin/demo/cleanup'), function (Request $r) use ($bundle) {
            // Only callable with demo session (fail-closed) — cleans expired globally
            $svc = $bundle()['sessions'];
            $ctx = $svc->resolveFromRequest($r);
            if ($ctx === null) {
                Response::error('Unauthorized', 401);
            }
            $n = $svc->cleanupExpired();
            Response::json(['data' => ['removed' => $n]]);
        });
    }

    /**
     * @return array{sessions: DemoSessionService, gateway: DemoSandboxGateway, store: DemoOverlayStore, seed: DemoSeedService}
     */
    private function services(Database $db, array $app): array
    {
        $storage = (string) ($app['storage'] ?? dirname(__DIR__, 3) . '/storage');
        $seedDir = __DIR__ . '/seed';
        $store = new DemoOverlayStore($db);
        $seed = new DemoSeedService($store, $seedDir);
        $sessions = new DemoSessionService($db, $app, $store, $seed, $storage);
        $gateway = new DemoSandboxGateway($sessions, $store);
        return compact('sessions', 'gateway', 'store', 'seed');
    }
}
