<?php
declare(strict_types=1);

namespace App\PackageModules\SdkSchedulerProbe;

use App\Platform\Contracts\PlatformRequestInterface;
use App\Platform\Package\AbstractPackageModule;
use App\Platform\Package\PlatformResponse;
use App\Platform\PlatformContext;

/**
 * Synthetic scheduler boundary probe — unknown slug, package-owned jobs only.
 */
final class SdkSchedulerProbeModule extends AbstractPackageModule
{
    public function name(): string
    {
        return 'sdk-scheduler-probe';
    }

    public function label(): string
    {
        return 'SDK Scheduler Probe';
    }

    public function priority(): int
    {
        return 211;
    }

    public function bootPlatform(PlatformContext $ctx): void
    {
        parent::bootPlatform($ctx);

        $ctx->capabilities()->require('scheduler.jobs');
        $ctx->capabilities()->require('api.routes');

        $sched = $ctx->scheduler();
        $db = $ctx->database();
        $slug = $ctx->slug();

        $sched->registerHandler('tick', static function (array $payload) use ($db, $slug): void {
            $db->run(
                'INSERT INTO sdk_scheduler_probe_hits (slug, kind, note, created_at) VALUES (?, ?, ?, NOW())',
                [$slug, 'tick', (string) ($payload['note'] ?? 'cron')]
            );
        });

        $sched->registerHandler('delayed', static function (array $payload) use ($db, $slug): void {
            $db->run(
                'INSERT INTO sdk_scheduler_probe_hits (slug, kind, note, created_at) VALUES (?, ?, ?, NOW())',
                [$slug, 'delayed', (string) ($payload['note'] ?? 'delay')]
            );
        });

        // Upsert — safe across package updates (no duplicate cron rows).
        $sched->scheduleCron('heartbeat', '*/5 * * * *', 'tick', ['note' => 'heartbeat'], true);

        $http = $ctx->http();
        $perms = $ctx->permissions();
        $protected = [$http->authMiddleware(), $http->permissionMiddleware()];

        $http->post('/admin/sdk-scheduler-probe/enqueue-delay', static function (PlatformRequestInterface $r) use ($perms, $sched) {
            $perms->require($r->user() ?? [], 'sdk-scheduler-probe.view');
            $id = $sched->enqueue('delayed', ['note' => 'admin-delay'], 0);
            PlatformResponse::json(['data' => ['ok' => true, 'job_id' => $id, 'type' => $sched->resolveType('delayed')]]);
        }, $protected);

        $http->get('/admin/sdk-scheduler-probe/hits', static function (PlatformRequestInterface $r) use ($perms, $db, $slug) {
            $perms->require($r->user() ?? [], 'sdk-scheduler-probe.view');
            try {
                $rows = $db->all(
                    'SELECT id, kind, note, created_at FROM sdk_scheduler_probe_hits WHERE slug=? ORDER BY id DESC LIMIT 50',
                    [$slug]
                );
            } catch (\Throwable) {
                $rows = [];
            }
            PlatformResponse::json(['data' => $rows]);
        }, $protected);
    }
}
