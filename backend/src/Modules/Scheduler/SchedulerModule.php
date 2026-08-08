<?php
declare(strict_types=1);

namespace App\Modules\Scheduler;

use App\Core\AbstractModule;
use App\Database;
use App\Middleware\AuthMiddleware;
use App\Middleware\PermissionMiddleware;
use App\Middleware\RateLimitMiddleware;
use App\Request;
use App\Response;
use App\Router;
use App\Services\ActivityLogService;
use App\Services\PermissionService;

final class SchedulerModule extends AbstractModule
{
    public function name(): string
    {
        return 'scheduler';
    }

    public function label(): string
    {
        return 'Планировщик';
    }

    public function priority(): int
    {
        return 12;
    }

    public function boot(Database $db, array $app): void
    {
        JobHandlerRegistry::register('scheduler.noop', static function (array $payload): void {
            // health / test job
        }, 'scheduler');
        JobHandlerRegistry::register('platform.event.dispatch', static function (array $payload): void {
            $event = (string) ($payload['_platform_event'] ?? '');
            if ($event === '') {
                return;
            }
            try {
                $events = \App\Core\Container::getInstance()->get(\App\Core\EventDispatcher::class);
                if ($events instanceof \App\Core\EventDispatcher) {
                    $events->dispatch($event, $payload);
                }
            } catch (\Throwable) {
                // dispatcher may be unavailable in CLI-only runners
            }
        }, 'platform');
        JobHandlerRegistry::register('scheduler.cleanup', static function (array $payload) use ($db): void {
            $days = max(1, (int) ($payload['days'] ?? 30));
            $db->run(
                "DELETE FROM job_attempts WHERE created_at < DATE_SUB(NOW(), INTERVAL ? DAY)",
                [$days]
            );
            $db->run(
                "DELETE FROM scheduled_jobs WHERE status IN ('completed','cancelled','failed') AND finished_at < DATE_SUB(NOW(), INTERVAL ? DAY)",
                [$days]
            );
        }, 'scheduler');
    }

    public function settingsSchema(): array
    {
        return [
            ['key' => '_h', 'label' => 'Cron / tick', 'type' => 'heading',
                'help' => 'CLI: php backend/bin/scheduler.php run --limit=20. HTTP: POST /api/v1/system/scheduler/tick с заголовком X-Scheduler-Token.'],
            ['key' => 'tick_token', 'label' => 'HTTP tick token', 'type' => 'password', 'default' => '',
                'help' => 'Случайная строка; пусто = HTTP tick отключён (только CLI / lazy admin).'],
            ['key' => 'lazy_tick_minutes', 'label' => 'Lazy tick порог (мин)', 'type' => 'number', 'default' => 5],
            ['key' => 'stale_warning_minutes', 'label' => 'Предупреждение если нет tick (мин)', 'type' => 'number', 'default' => 30],
        ];
    }

    public function settings(): array
    {
        return [
            'tick_token' => '',
            'lazy_tick_minutes' => 5,
            'stale_warning_minutes' => 30,
        ];
    }

    public function adminNav(): array
    {
        return [
            [
                'group' => 'Система',
                'path' => '/admin/scheduler',
                'label' => 'Планировщик',
                'permission' => 'scheduler.view',
                'icon' => 'activity',
            ],
        ];
    }

    public function registerRoutes(Router $router, Database $db, array $app, string $apiPrefix): void
    {
        $p = fn(string $path) => rtrim($apiPrefix, '/') . $path;
        $perms = new PermissionService($db);
        $protected = [new AuthMiddleware($app['jwt_secret']), new PermissionMiddleware($perms)];
        $tickRate = new RateLimitMiddleware($db, 30, 60);
        $activity = new ActivityLogService($db);

        // Public/system HTTP cron endpoint (token-protected)
        $router->post($p('/system/scheduler/tick'), function (Request $r) use ($db) {
            $token = (string) ($r->header('X-Scheduler-Token') ?? $r->input('token') ?? '');
            $settings = $this->loadSettings($db);
            $expected = (string) ($settings['tick_token'] ?? '');
            if ($expected === '' || !hash_equals($expected, $token)) {
                Response::error('Forbidden', 403);
            }
            $limit = max(1, min(100, (int) ($r->input('limit') ?? 20)));
            $stats = (new SchedulerTick($db))->tick($limit, 25);
            Response::json(['data' => $stats]);
        }, [$tickRate]);

        $router->get($p('/admin/scheduler/jobs'), function (Request $r) use ($db, $perms) {
            $perms->require($r->user, 'scheduler.view');
            $status = (string) ($r->query('status') ?? '');
            $queue = (string) ($r->query('queue') ?? '');
            $sql = 'SELECT id, type, queue, priority, status, available_at, started_at, finished_at, attempts, max_attempts, last_error, deduplication_key, created_at FROM scheduled_jobs WHERE 1=1';
            $params = [];
            if ($status !== '') {
                $sql .= ' AND status=?';
                $params[] = $status;
            }
            if ($queue !== '') {
                $sql .= ' AND queue=?';
                $params[] = $queue;
            }
            $sql .= ' ORDER BY id DESC LIMIT 200';
            $rows = $db->all($sql, $params);
            foreach ($rows as &$row) {
                $row['payload_preview'] = null;
            }
            unset($row);
            // Attach redacted payload separately
            foreach ($rows as $i => $row) {
                $full = $db->one('SELECT payload FROM scheduled_jobs WHERE id=?', [(int) $row['id']]);
                $rows[$i]['payload_preview'] = $this->redactPayload((string) ($full['payload'] ?? '{}'));
            }
            Response::json(['data' => $rows]);
        }, $protected);

        $router->get($p('/admin/scheduler/stats'), function (Request $r) use ($db, $perms) {
            $perms->require($r->user, 'scheduler.view');
            $byStatus = $db->all('SELECT status, COUNT(*) c FROM scheduled_jobs GROUP BY status');
            $byQueue = $db->all('SELECT queue, status, COUNT(*) c FROM scheduled_jobs GROUP BY queue, status');
            $runner = new JobRunner($db);
            $last = $runner->getMeta('last_tick_at');
            $settings = $this->loadSettings($db);
            $warnMins = (int) ($settings['stale_warning_minutes'] ?? 30);
            $stale = true;
            if ($last) {
                $ts = strtotime($last . ' UTC') ?: strtotime($last);
                $stale = !$ts || (time() - $ts) > ($warnMins * 60);
            }
            Response::json(['data' => [
                'by_status' => $byStatus,
                'by_queue' => $byQueue,
                'last_tick_at' => $last,
                'cron_stale' => $stale,
                'handlers' => JobHandlerRegistry::types(),
                'handlers_catalog' => JobHandlerRegistry::catalog(),
            ]]);
        }, $protected);

        $router->post($p('/admin/scheduler/jobs/{id}/retry'), function (Request $r, string $id) use ($db, $perms, $activity) {
            $perms->require($r->user, 'scheduler.manage');
            $ok = (new JobQueue($db))->retry((int) $id);
            if (!$ok) {
                Response::error('Cannot retry', 422);
            }
            $activity->log($r, 'retry', 'scheduled_jobs', (int) $id, null);
            Response::json(['data' => ['ok' => true]]);
        }, $protected);

        $router->post($p('/admin/scheduler/jobs/{id}/cancel'), function (Request $r, string $id) use ($db, $perms, $activity) {
            $perms->require($r->user, 'scheduler.manage');
            $ok = (new JobQueue($db))->cancel((int) $id);
            if (!$ok) {
                Response::error('Cannot cancel', 422);
            }
            $activity->log($r, 'cancel', 'scheduled_jobs', (int) $id, null);
            Response::json(['data' => ['ok' => true]]);
        }, $protected);

        $router->post($p('/admin/scheduler/tick'), function (Request $r) use ($db, $perms, $activity) {
            $perms->require($r->user, 'scheduler.manage');
            $limit = max(1, min(50, (int) ($r->input('limit') ?? 10)));
            $stats = (new SchedulerTick($db))->tick($limit, 20);
            $activity->log($r, 'tick', 'scheduler', null, null, $stats);
            Response::json(['data' => $stats]);
        }, $protected);
    }

    /** Called from AdminController dashboard after response data built — see patch. */
    public static function maybeLazyTick(Database $db): void
    {
        try {
            $reg = \App\Core\Container::getInstance()->get(\App\Core\ModuleRegistry::class);
            $mod = $reg->get('scheduler');
            if (!$mod || !$reg->state()->isEnabled($mod)) {
                return;
            }
            $settings = array_merge($mod->settings(), $reg->state()->getSettings($mod));
            $mins = (int) ($settings['lazy_tick_minutes'] ?? 5);
            (new SchedulerTick($db))->lazyTick($mins, 3, 2);
        } catch (\Throwable) {
        }
    }

    /** @return array<string, mixed> */
    private function loadSettings(Database $db): array
    {
        try {
            $reg = \App\Core\Container::getInstance()->get(\App\Core\ModuleRegistry::class);
            $mod = $reg->get('scheduler');
            if (!$mod) {
                return $this->settings();
            }
            return array_merge($mod->settings(), $reg->state()->getSettings($mod));
        } catch (\Throwable) {
            return $this->settings();
        }
    }

    private function redactPayload(string $json): mixed
    {
        return \App\Support\SecretRedactor::redactJson($json);
    }
}
