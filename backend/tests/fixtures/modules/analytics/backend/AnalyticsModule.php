<?php
declare(strict_types=1);

namespace App\PackageModules\Analytics;

use App\Platform\Contracts\PlatformRequestInterface;
use App\Platform\Package\AbstractPackageModule;
use App\Platform\Package\PlatformResponse;
use App\Platform\PlatformContext;

/**
 * Site analytics — installable package (extracted from bundled Modules/Analytics).
 */
final class AnalyticsModule extends AbstractPackageModule
{
    public function name(): string
    {
        return 'analytics';
    }

    public function label(): string
    {
        return 'Аналитика';
    }

    public function priority(): int
    {
        return 56;
    }

    public function adminNav(): array
    {
        return [[
            'group' => 'Система',
            'path' => '/admin/analytics',
            'label' => 'Аналитика',
            'permission' => 'analytics.view',
            'icon' => 'bar-chart-3',
        ]];
    }

    public function settingsSchema(): array
    {
        return [
            ['key' => 'retention_days', 'label' => 'Хранение сырых событий (дней)', 'type' => 'number', 'default' => 365],
            ['key' => 'respect_dnt', 'label' => 'Уважать Do Not Track', 'type' => 'checkbox', 'default' => true],
        ];
    }

    public function settings(): array
    {
        return ['retention_days' => 365, 'respect_dnt' => true];
    }

    public function bootPlatform(PlatformContext $ctx): void
    {
        parent::bootPlatform($ctx);

        $ctx->capabilities()->require('scheduler.jobs');
        $ctx->capabilities()->require('api.routes');
        $ctx->capabilities()->require('permissions.check');

        $http = $ctx->http();
        $db = $ctx->database();
        $perms = $ctx->permissions();
        $sched = $ctx->scheduler();
        $salt = (string) ($ctx->config()->get('jwt_secret') ?? '');

        $svc = static fn(): AnalyticsService => new AnalyticsService($db, $salt);

        $sched->registerHandler('retention', static function (array $payload) use ($svc, $db): array {
            $settings = $db->one('SELECT retention_days FROM analytics_settings WHERE id=1') ?? [];
            $days = (int) ($payload['days'] ?? $settings['retention_days'] ?? 365);
            return $svc()->cleanup($days);
        });

        $sched->registerHandler('aggregate', static function (array $payload) use ($svc): int {
            return $svc()->aggregateDaily(
                isset($payload['from']) && is_string($payload['from']) ? $payload['from'] : null,
                isset($payload['to']) && is_string($payload['to']) ? $payload['to'] : null,
            );
        });

        $sched->scheduleCron('retention', '0 * * * *', 'retention', [], true);
        $sched->scheduleCron('aggregate', '*/15 * * * *', 'aggregate', [], true);

        $rate = $http->rateLimitMiddleware(120, 60);
        $protected = [$http->authMiddleware(), $http->permissionMiddleware()];

        $http->post('/analytics/collect', static function (PlatformRequestInterface $r) use ($svc, $db) {
            $settings = $db->one('SELECT respect_dnt FROM analytics_settings WHERE id=1') ?? ['respect_dnt' => 1];
            if ((int) $settings['respect_dnt'] === 1 && (string) ($r->header('DNT') ?? '') === '1') {
                PlatformResponse::json(['data' => ['accepted' => false, 'reason' => 'dnt']]);
            }
            try {
                PlatformResponse::json([
                    'data' => $svc()->ingest($r->body(), $r->ip(), $r->header('User-Agent')),
                ], 202);
            } catch (\InvalidArgumentException $e) {
                PlatformResponse::error($e->getMessage(), 422);
            }
        }, [$rate]);

        $http->get('/admin/analytics/overview', static function (PlatformRequestInterface $r) use ($svc, $perms) {
            $perms->require($r->user() ?? [], 'analytics.view');
            $q = $r->query();
            PlatformResponse::json(['data' => $svc()->overview(
                is_string($q['from'] ?? null) ? $q['from'] : null,
                is_string($q['to'] ?? null) ? $q['to'] : null,
            )]);
        }, $protected);

        $http->post('/admin/analytics/aggregate', static function (PlatformRequestInterface $r) use ($svc, $perms) {
            $perms->require($r->user() ?? [], 'analytics.manage');
            PlatformResponse::json(['data' => [
                'rows' => $svc()->aggregateDaily(
                    is_string($r->input('from')) ? $r->input('from') : null,
                    is_string($r->input('to')) ? $r->input('to') : null,
                ),
            ]]);
        }, $protected);

        $http->get('/admin/analytics/goals', static function (PlatformRequestInterface $r) use ($db, $perms) {
            $perms->require($r->user() ?? [], 'analytics.view');
            try {
                $rows = $db->all('SELECT * FROM analytics_goals ORDER BY id DESC');
            } catch (\Throwable) {
                $rows = [];
            }
            PlatformResponse::json(['data' => is_array($rows) ? $rows : []]);
        }, $protected);

        $http->post('/admin/analytics/goals', static function (PlatformRequestInterface $r) use ($db, $perms) {
            $perms->require($r->user() ?? [], 'analytics.manage');
            $body = $r->body();
            $event = (string) ($body['event_name'] ?? '');
            if (!in_array($event, AnalyticsService::EVENTS, true)) {
                PlatformResponse::error('Unsupported event', 422);
            }
            $conditions = $body['conditions'] ?? new \stdClass();
            $encoded = json_encode($conditions, JSON_UNESCAPED_UNICODE);
            if ($encoded === false) {
                PlatformResponse::error('Invalid conditions', 422);
            }
            $db->run(
                'INSERT INTO analytics_goals (name,event_name,conditions,value,is_active) VALUES (?,?,?,?,?)',
                [
                    trim((string) ($body['name'] ?? 'Goal')),
                    $event,
                    $encoded,
                    $body['value'] ?? null,
                    !empty($body['is_active']) ? 1 : 0,
                ]
            );
            $id = $db->lastInsertId();
            PlatformResponse::json(['data' => $db->one('SELECT * FROM analytics_goals WHERE id=?', [$id])], 201);
        }, $protected);

        $http->delete('/admin/analytics/goals/{id}', static function (PlatformRequestInterface $r, string $id) use ($db, $perms) {
            $perms->require($r->user() ?? [], 'analytics.manage');
            $db->run('DELETE FROM analytics_goals WHERE id=?', [(int) $id]);
            PlatformResponse::json(['data' => ['ok' => true]]);
        }, $protected);
    }
}
