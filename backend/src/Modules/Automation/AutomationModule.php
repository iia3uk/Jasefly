<?php
declare(strict_types=1);

namespace App\Modules\Automation;

use App\Core\AbstractModule;
use App\Core\Container;
use App\Core\EventDispatcher;
use App\Database;
use App\Middleware\AuthMiddleware;
use App\Middleware\PermissionMiddleware;
use App\Modules\Scheduler\JobHandlerRegistry;
use App\Request;
use App\Response;
use App\Router;
use App\Services\PermissionService;

final class AutomationModule extends AbstractModule
{
    private const EVENTS = [
        'form.submitted', 'form.submission.status_changed', 'order.created', 'order.paid', 'comment.created',
        'subscriber.created', 'payment.completed', 'user.registered', 'content.published', 'webhook.received',
    ];

    public function name(): string { return 'automation'; }
    public function label(): string { return 'Автоматизация'; }
    public function priority(): int { return 16; }
    // Enablement via PluginStateService / modules.is_enabled (default-off).

    public function adminNav(): array
    {
        return [[
            'group' => 'Система', 'path' => '/admin/automations', 'label' => 'Автоматизация',
            'permission' => 'automations.view', 'icon' => 'workflow',
        ]];
    }

    public function boot(Database $db, array $app): void
    {
        $engine = new AutomationEngine($db);
        JobHandlerRegistry::register('automation.resume', static fn(array $payload) => $engine->resume($payload));
        try {
            $events = Container::getInstance()->get(EventDispatcher::class);
            foreach (self::EVENTS as $event) {
                $events->subscribe($event, function (mixed $payload) use ($db, $engine, $event): void {
                    try {
                        if (!$db->inspector()->tableExists('automations')) {
                            return;
                        }
                        $context = is_array($payload) ? $payload : ['payload' => $payload];
                        $context['_event'] = $event;
                        $rows = $db->all("SELECT * FROM automations WHERE status='active' AND trigger_type=?", [$event]);
                        foreach ($rows as $row) {
                            $sourceId = $context['id']
                                ?? $context['submission_id']
                                ?? $context['submission_public_id']
                                ?? $context['public_id']
                                ?? null;
                            $key = $sourceId === null ? null : hash('sha256', $event . ':' . $sourceId . ':' . $row['id']);
                            $engine->run($row, $context, $key);
                        }
                    } catch (\Throwable) {
                    }
                });
            }
        } catch (\Throwable) {
        }
    }

    public function registerRoutes(Router $router, Database $db, array $app, string $apiPrefix): void
    {
        $p = fn(string $path) => rtrim($apiPrefix, '/') . $path;
        $perms = new PermissionService($db);
        $protected = [new AuthMiddleware($app['jwt_secret']), new PermissionMiddleware($perms)];

        $router->get($p('/admin/automations'), function (Request $r) use ($db, $perms) {
            $perms->require($r->user, 'automations.view');
            Response::json(['data' => $db->all('SELECT * FROM automations ORDER BY id DESC')]);
        }, $protected);
        $router->post($p('/admin/automations'), function (Request $r) use ($db, $perms) {
            $perms->require($r->user, 'automations.manage');
            $definition = $this->definition($r->input('definition'));
            $db->run(
                'INSERT INTO automations (name,description,status,trigger_type,definition,created_by) VALUES (?,?,?,?,?,?)',
                [trim((string) ($r->input('name') ?? 'Автоматизация')), $r->input('description'),
                    $this->status($r->input('status')), (string) ($r->input('trigger_type') ?? 'form.submitted'),
                    $definition, $r->user['sub'] ?? $r->user['id'] ?? null]
            );
            Response::json(['data' => $db->one('SELECT * FROM automations WHERE id=?', [(int) $db->id()])], 201);
        }, $protected);
        $router->get($p('/admin/automations/{id}'), function (Request $r, string $id) use ($db, $perms) {
            $perms->require($r->user, 'automations.view');
            $row = $db->one('SELECT * FROM automations WHERE id=?', [(int) $id]);
            if (!$row) Response::error('Not found', 404);
            Response::json(['data' => $row]);
        }, $protected);
        $router->put($p('/admin/automations/{id}'), function (Request $r, string $id) use ($db, $perms) {
            $perms->require($r->user, 'automations.manage');
            $row = $db->one('SELECT * FROM automations WHERE id=?', [(int) $id]);
            if (!$row) Response::error('Not found', 404);
            $db->run(
                'UPDATE automations SET name=?,description=?,status=?,trigger_type=?,definition=?,version=version+1 WHERE id=?',
                [(string) ($r->input('name') ?? $row['name']), $r->input('description') ?? $row['description'],
                    $this->status($r->input('status') ?? $row['status']),
                    (string) ($r->input('trigger_type') ?? $row['trigger_type']),
                    $r->input('definition') === null ? $row['definition'] : $this->definition($r->input('definition')), (int) $id]
            );
            Response::json(['data' => $db->one('SELECT * FROM automations WHERE id=?', [(int) $id])]);
        }, $protected);
        $router->delete($p('/admin/automations/{id}'), function (Request $r, string $id) use ($db, $perms) {
            $perms->require($r->user, 'automations.manage');
            $db->run('DELETE FROM automations WHERE id=?', [(int) $id]);
            Response::json(['data' => ['ok' => true]]);
        }, $protected);
        $router->post($p('/admin/automations/{id}/run'), function (Request $r, string $id) use ($db, $perms) {
            $perms->require($r->user, 'automations.run');
            $row = $db->one('SELECT * FROM automations WHERE id=?', [(int) $id]);
            if (!$row) Response::error('Not found', 404);
            $context = $r->input('context') ?? $r->all();
            $runId = (new AutomationEngine($db))->run($row, is_array($context) ? $context : [], bin2hex(random_bytes(16)));
            Response::json(['data' => ['run_id' => $runId]]);
        }, $protected);
        $router->post($p('/admin/automations/{id}/test'), function (Request $r, string $id) use ($db, $perms) {
            $perms->require($r->user, 'automations.run');
            $row = $db->one('SELECT * FROM automations WHERE id=?', [(int) $id]);
            if (!$row) Response::error('Not found', 404);
            $context = $r->input('context') ?? [];
            $runId = (new AutomationEngine($db))->run($row, is_array($context) ? $context : [], 'test-' . bin2hex(random_bytes(12)));
            Response::json(['data' => ['run_id' => $runId, 'test' => true]]);
        }, $protected);
        $router->get($p('/admin/automations/{id}/runs'), function (Request $r, string $id) use ($db, $perms) {
            $perms->require($r->user, 'automations.view');
            Response::json(['data' => $db->all(
                'SELECT * FROM automation_runs WHERE automation_id=? ORDER BY id DESC LIMIT 100', [(int) $id]
            )]);
        }, $protected);
    }

    private function status(mixed $value): string
    {
        $status = (string) $value;
        return in_array($status, ['draft', 'active', 'paused', 'archived'], true) ? $status : 'draft';
    }

    private function definition(mixed $value): string
    {
        if (is_string($value)) {
            $decoded = json_decode($value, true);
            if (!is_array($decoded)) Response::error('Invalid definition JSON', 422);
            $value = $decoded;
        }
        if (!is_array($value)) $value = ['conditions' => [], 'steps' => []];
        return json_encode($value, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) ?: '{}';
    }
}
