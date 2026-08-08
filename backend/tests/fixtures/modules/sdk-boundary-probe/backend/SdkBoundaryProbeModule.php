<?php
declare(strict_types=1);

namespace App\PackageModules\SdkBoundaryProbe;

use App\Platform\Contracts\PlatformRequestInterface;
use App\Platform\Package\AbstractPackageModule;
use App\Platform\Package\PlatformResponse;
use App\Platform\PlatformContext;

/**
 * Synthetic architectural probe — not a product module.
 * Must load for an unknown slug without any core slug allowlist entry.
 */
final class SdkBoundaryProbeModule extends AbstractPackageModule
{
    public function name(): string
    {
        return 'sdk-boundary-probe';
    }

    public function label(): string
    {
        return 'SDK Boundary Probe';
    }

    public function priority(): int
    {
        return 210;
    }

    public function adminNav(): array
    {
        return [[
            'group' => 'Разработка',
            'path' => '/admin/sdk-boundary-probe',
            'label' => 'SDK Probe',
            'permission' => 'sdk-boundary-probe.view',
            'icon' => 'flask-conical',
        ]];
    }

    public function blocks(): array
    {
        return [[
            'type' => 'sdk-probe',
            'label' => 'SDK Probe',
            'category' => 'basic',
        ]];
    }

    public function bootPlatform(PlatformContext $ctx): void
    {
        parent::bootPlatform($ctx);

        foreach (['api.routes', 'permissions.check', 'events.publish', 'events.subscribe', 'builder.widgets'] as $cap) {
            $ctx->capabilities()->require($cap);
        }

        $slug = $ctx->slug();
        $events = $ctx->events();
        $db = $ctx->database();
        $content = $ctx->content();
        $http = $ctx->http();
        $perms = $ctx->permissions();

        $events->subscribe('sdk-boundary-probe.ping', static function (array $payload) use ($db, $slug): void {
            try {
                $db->run(
                    'INSERT INTO sdk_boundary_probe_hits (slug, note, created_at) VALUES (?, ?, NOW())',
                    [$slug, (string) ($payload['note'] ?? 'ping')]
                );
            } catch (\Throwable) {
                // Table may be absent before migrations — probe must not crash host.
            }
        });

        $protected = [$http->authMiddleware(), $http->permissionMiddleware()];

        $http->get('/admin/sdk-boundary-probe/ping', static function (PlatformRequestInterface $r) use ($perms, $events, $slug, $db, $content) {
            $perms->require($r->user() ?? [], 'sdk-boundary-probe.view');
            $events->publish('sdk-boundary-probe.ping', ['note' => 'admin-ping', 'slug' => $slug]);
            $hits = 0;
            try {
                $row = $db->one('SELECT COUNT(*) AS c FROM sdk_boundary_probe_hits WHERE slug=?', [$slug]);
                $hits = (int) ($row['c'] ?? 0);
            } catch (\Throwable) {
            }
            PlatformResponse::json(['data' => [
                'ok' => true,
                'module' => $slug,
                'hits' => $hits,
                'content_resource' => $content->isContentResource('pages'),
                'corpus_count' => count($content->collectHumanReadableStrings(1)),
                'time' => gmdate(DATE_ATOM),
            ]]);
        }, $protected);

        $http->delete('/admin/sdk-boundary-probe/hits', static function (PlatformRequestInterface $r) use ($perms, $db, $slug) {
            $perms->require($r->user() ?? [], 'sdk-boundary-probe.view');
            try {
                $db->run('DELETE FROM sdk_boundary_probe_hits WHERE slug=?', [$slug]);
            } catch (\Throwable) {
            }
            PlatformResponse::json(['data' => ['ok' => true, 'cleared' => true]]);
        }, $protected);

        $http->get('/sdk-boundary-probe/public', static function () use ($slug) {
            PlatformResponse::json(['data' => [
                'ok' => true,
                'module' => $slug,
                'public' => true,
            ]]);
        });
    }
}
