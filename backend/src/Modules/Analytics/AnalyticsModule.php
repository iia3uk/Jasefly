<?php
declare(strict_types=1);

namespace App\Modules\Analytics;

use App\Core\AbstractModule;
use App\Database;
use App\Middleware\AuthMiddleware;
use App\Middleware\PermissionMiddleware;
use App\Middleware\RateLimitMiddleware;
use App\Modules\Scheduler\JobHandlerRegistry;
use App\Request;
use App\Response;
use App\Router;
use App\Services\PermissionService;

final class AnalyticsModule extends AbstractModule
{
    public function name(): string { return 'analytics'; }
    public function label(): string { return 'Аналитика'; }
    public function priority(): int { return 56; }

    public function boot(Database $db, array $app): void
    {
        JobHandlerRegistry::register('analytics.retention', static function (array $payload) use ($db, $app): array {
            $settings = $db->one('SELECT retention_days FROM analytics_settings WHERE id=1') ?? [];
            $days = (int) ($payload['days'] ?? $settings['retention_days'] ?? 365);
            return (new AnalyticsService($db, (string) $app['jwt_secret']))->cleanup($days);
        });
        JobHandlerRegistry::register('analytics.aggregate', static function (array $payload) use ($db, $app): int {
            return (new AnalyticsService($db, (string) $app['jwt_secret']))->aggregateDaily($payload['from'] ?? null, $payload['to'] ?? null);
        });
    }

    public function adminNav(): array
    {
        return [['group' => 'Система', 'path' => '/admin/analytics', 'label' => 'Аналитика', 'permission' => 'analytics.view', 'icon' => 'bar-chart-3']];
    }

    public function settingsSchema(): array
    {
        return [
            ['key' => 'retention_days', 'label' => 'Хранение сырых событий (дней)', 'type' => 'number', 'default' => 365],
            ['key' => 'respect_dnt', 'label' => 'Уважать Do Not Track', 'type' => 'checkbox', 'default' => true],
        ];
    }

    public function settings(): array { return ['retention_days' => 365, 'respect_dnt' => true]; }

    public function registerRoutes(Router $router, Database $db, array $app, string $apiPrefix): void
    {
        $p = fn(string $path): string => rtrim($apiPrefix, '/') . $path;
        $svc = new AnalyticsService($db, (string) $app['jwt_secret']);
        $rate = new RateLimitMiddleware($db, 120, 60);
        $perms = new PermissionService($db);
        $protected = [new AuthMiddleware($app['jwt_secret']), new PermissionMiddleware($perms)];

        $router->post($p('/analytics/collect'), function (Request $r) use ($svc, $db) {
            $settings = $db->one('SELECT respect_dnt FROM analytics_settings WHERE id=1') ?? ['respect_dnt' => 1];
            if ((int) $settings['respect_dnt'] === 1 && (string) ($r->header('DNT') ?? '') === '1') {
                Response::json(['data' => ['accepted' => false, 'reason' => 'dnt']]);
            }
            try {
                Response::json(['data' => $svc->ingest($r->all(), $r->ip(), $r->header('User-Agent'))], 202);
            } catch (\InvalidArgumentException $e) { Response::error($e->getMessage(), 422); }
        }, [$rate]);

        $router->get($p('/admin/analytics/overview'), function (Request $r) use ($svc, $perms) {
            $perms->require($r->user, 'analytics.view');
            Response::json(['data' => $svc->overview(is_string($r->query('from')) ? $r->query('from') : null, is_string($r->query('to')) ? $r->query('to') : null)]);
        }, $protected);
        $router->post($p('/admin/analytics/aggregate'), function (Request $r) use ($svc, $perms) {
            $perms->require($r->user, 'analytics.manage');
            Response::json(['data' => ['rows' => $svc->aggregateDaily($r->input('from'), $r->input('to'))]]);
        }, $protected);
        $router->get($p('/admin/analytics/goals'), function (Request $r) use ($db, $perms) {
            $perms->require($r->user, 'analytics.view');
            Response::json(['data' => $db->all('SELECT * FROM analytics_goals ORDER BY id DESC')]);
        }, $protected);
        $router->post($p('/admin/analytics/goals'), function (Request $r) use ($db, $perms) {
            $perms->require($r->user, 'analytics.manage');
            $event = (string) ($r->input('event_name') ?? '');
            if (!in_array($event, AnalyticsService::EVENTS, true)) { Response::error('Unsupported event', 422); }
            $db->run('INSERT INTO analytics_goals (name,event_name,conditions,value,is_active) VALUES (?,?,?,?,?)', [
                trim((string) ($r->input('name') ?? 'Goal')), $event,
                json_encode($r->input('conditions') ?? new \stdClass(), JSON_UNESCAPED_UNICODE),
                $r->input('value'), (bool) ($r->input('is_active') ?? true) ? 1 : 0,
            ]);
            Response::json(['data' => $db->one('SELECT * FROM analytics_goals WHERE id=?', [(int) $db->id()])], 201);
        }, $protected);
        $router->delete($p('/admin/analytics/goals/{id}'), function (Request $r, string $id) use ($db, $perms) {
            $perms->require($r->user, 'analytics.manage');
            $db->run('DELETE FROM analytics_goals WHERE id=?', [(int) $id]);
            Response::json(['data' => ['ok' => true]]);
        }, $protected);
    }
}
