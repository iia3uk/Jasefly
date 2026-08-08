<?php
declare(strict_types=1);

namespace App\PackageModules\Zed;

use App\Platform\Package\AbstractPackageModule;
use App\Platform\Package\PlatformResponse;
use App\Platform\PlatformContext;

/**
 * Dual-runtime synthetic probe v2 — PHP entry for unknown slug `zed`.
 * Registers surfaces/settings/ACL/events without host slug hardcodes.
 */
final class ZedProbeModule extends AbstractPackageModule
{
    public function name(): string
    {
        return 'zed';
    }

    public function label(): string
    {
        return 'Zed Synthetic Probe';
    }

    public function priority(): int
    {
        return 220;
    }

    public function bootPlatform(PlatformContext $ctx): void
    {
        parent::bootPlatform($ctx);

        $slug = $ctx->slug();
        $http = $ctx->http();
        $events = $ctx->events();
        $caps = $ctx->capabilities();

        $caps->require('api.routes');

        // Runtime registration (in addition to module.json surfaces loaded by host).
        $ctx->surfaces()->register([
            'trash' => [
                ['resource' => 'zed-items', 'table' => 'zed_items'],
            ],
            'schema' => [
                ['table' => 'zed_items', 'role' => 'owner'],
            ],
        ]);

        $events->declare($slug . '.ready', [
            'label' => 'Synthetic package ready',
            'category' => 'probe',
            'payload' => ['slug' => $slug],
        ]);

        $http->get('/' . $slug . '/ping', static function () use ($slug, $events, $caps, $ctx) {
            $marker = $ctx->settings()->get('probe_marker', null);
            PlatformResponse::json(['data' => [
                'pong' => true,
                'slug' => $slug,
                'runtime' => 'php-shared',
                'capability' => $caps->has($slug . '.ping'),
                'declared' => $events->hasDeclared($slug . '.ready'),
                'settings_marker' => $marker,
            ]]);
        });

        $http->post('/' . $slug . '/settings', static function ($req) use ($ctx) {
            $body = [];
            if (is_object($req) && method_exists($req, 'all')) {
                $body = (array) $req->all();
            } elseif (is_object($req) && method_exists($req, 'input')) {
                $body = (array) ($req->input() ?? []);
            }
            $marker = (string) ($body['probe_marker'] ?? 'zed-ok');
            $ctx->settings()->set('probe_marker', $marker);
            PlatformResponse::json(['data' => [
                'probe_marker' => $ctx->settings()->get('probe_marker'),
            ]]);
        }, [$http->authMiddleware(), $http->permissionMiddleware('zed.manage')]);

        $http->get('/' . $slug . '/secure', static function () use ($slug) {
            PlatformResponse::json(['data' => [
                'secure' => true,
                'slug' => $slug,
            ]]);
        }, [$http->authMiddleware(), $http->permissionMiddleware('zed.view')]);

        $ctx->scheduler()->registerHandler('tick', static function (): void {
            // noop — host namespaces to zed.tick
        });
    }
}
