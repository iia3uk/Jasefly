<?php
declare(strict_types=1);

namespace App\PackageModules\Automation;

use App\Platform\Contracts\PlatformRequestInterface;
use App\Platform\Package\AbstractPackageModule;
use App\Platform\Package\PlatformResponse;
use App\Platform\PlatformContext;

/**
 * Automation — installable package. Triggers discovered via EventCatalog (metadata);
 * EventDispatcher remains the sole publish/subscribe runtime.
 */
final class AutomationModule extends AbstractPackageModule
{
    public function name(): string
    {
        return 'automation';
    }

    public function label(): string
    {
        return 'Автоматизация';
    }

    public function priority(): int
    {
        return 16;
    }

    public function adminNav(): array
    {
        return [[
            'group' => 'Система',
            'path' => '/admin/automations',
            'label' => 'Автоматизация',
            'permission' => 'automations.view',
            'icon' => 'workflow',
        ]];
    }

    public function bootPlatform(PlatformContext $ctx): void
    {
        parent::bootPlatform($ctx);

        foreach ([
            'api.routes',
            'admin.pages',
            'permissions.check',
            'scheduler.jobs',
            'events.publish',
            'events.subscribe',
        ] as $cap) {
            $ctx->capabilities()->require($cap);
        }

        $http = $ctx->http();
        $db = $ctx->database();
        $perms = $ctx->permissions();
        $events = $ctx->events();
        $sched = $ctx->scheduler();

        $engine = new AutomationEngine(
            $db,
            $ctx->mail(),
            $http,
            $ctx->notifications(),
            $sched,
        );
        // Forms-specific SQL isolated from generic engine (compat / tech debt).
        $engine->registerCompatAction(
            'update_submission',
            new FormsSubmissionCompatAction($db, new ConditionEngine())
        );

        $sched->registerHandler('resume', static function (array $payload) use ($engine): void {
            $engine->resume($payload);
        });

        // Wildcard bridge: no product-plugin event whitelist.
        $events->subscribe('*', static function (mixed ...$args) use ($db, $engine): void {
            $event = is_string($args[0] ?? null) ? (string) $args[0] : '';
            $payload = $args[1] ?? null;
            if ($event === '' || $event === '*') {
                return;
            }
            try {
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
        }, 50);

        $protected = [$http->authMiddleware(), $http->permissionMiddleware()];

        $http->get('/admin/automations/triggers', static function (PlatformRequestInterface $r) use ($perms, $events) {
            $perms->require($r->user() ?? [], 'automations.view');
            $list = array_map(static function (array $e): array {
                return [
                    'id' => $e['id'],
                    'value' => $e['id'],
                    'label' => $e['label'],
                    'category' => $e['category'],
                    'owner' => $e['owner'],
                    'payload' => $e['payload'],
                    'available' => true,
                ];
            }, $events->listDeclared());
            PlatformResponse::json(['data' => $list]);
        }, $protected);

        $http->get('/admin/automations', static function (PlatformRequestInterface $r) use ($db, $perms, $events) {
            $perms->require($r->user() ?? [], 'automations.view');
            $rows = $db->all('SELECT * FROM automations ORDER BY id DESC');
            PlatformResponse::json(['data' => array_map(
                static fn(array $row): array => self::enrichRow($row, $events),
                $rows
            )]);
        }, $protected);

        $http->post('/admin/automations', static function (PlatformRequestInterface $r) use ($db, $perms, $events) {
            $perms->require($r->user() ?? [], 'automations.manage');
            $trigger = (string) ($r->input('trigger_type') ?? '');
            if ($trigger === '' || !$events->hasDeclared($trigger)) {
                PlatformResponse::error('Unknown or unavailable trigger_type', 422);
            }
            $definition = self::definition($r->input('definition'));
            $user = $r->user() ?? [];
            $db->run(
                'INSERT INTO automations (name,description,status,trigger_type,definition,created_by) VALUES (?,?,?,?,?,?)',
                [
                    trim((string) ($r->input('name') ?? 'Автоматизация')),
                    $r->input('description'),
                    self::status($r->input('status')),
                    $trigger,
                    $definition,
                    $user['sub'] ?? $user['id'] ?? null,
                ]
            );
            $id = (int) $db->lastInsertId();
            PlatformResponse::json([
                'data' => self::enrichRow($db->one('SELECT * FROM automations WHERE id=?', [$id]) ?? [], $events),
            ], 201);
        }, $protected);

        $http->get('/admin/automations/{id}', static function (PlatformRequestInterface $r, string $id) use ($db, $perms, $events) {
            $perms->require($r->user() ?? [], 'automations.view');
            $row = $db->one('SELECT * FROM automations WHERE id=?', [(int) $id]);
            if (!$row) {
                PlatformResponse::error('Not found', 404);
            }
            PlatformResponse::json(['data' => self::enrichRow($row, $events)]);
        }, $protected);

        $http->put('/admin/automations/{id}', static function (PlatformRequestInterface $r, string $id) use ($db, $perms, $events) {
            $perms->require($r->user() ?? [], 'automations.manage');
            $row = $db->one('SELECT * FROM automations WHERE id=?', [(int) $id]);
            if (!$row) {
                PlatformResponse::error('Not found', 404);
            }
            $trigger = (string) ($r->input('trigger_type') ?? $row['trigger_type']);
            $triggerChanged = $trigger !== (string) $row['trigger_type'];
            if ($triggerChanged && !$events->hasDeclared($trigger)) {
                PlatformResponse::error('Unknown or unavailable trigger_type', 422);
            }
            $status = self::status($r->input('status') ?? $row['status']);
            if ($status === 'active' && !$events->hasDeclared($trigger)) {
                PlatformResponse::error('Cannot activate automation with unavailable trigger', 422);
            }
            $db->run(
                'UPDATE automations SET name=?,description=?,status=?,trigger_type=?,definition=?,version=version+1 WHERE id=?',
                [
                    (string) ($r->input('name') ?? $row['name']),
                    $r->input('description') ?? $row['description'],
                    $status,
                    $trigger,
                    $r->input('definition') === null ? $row['definition'] : self::definition($r->input('definition')),
                    (int) $id,
                ]
            );
            PlatformResponse::json([
                'data' => self::enrichRow($db->one('SELECT * FROM automations WHERE id=?', [(int) $id]) ?? [], $events),
            ]);
        }, $protected);

        $http->delete('/admin/automations/{id}', static function (PlatformRequestInterface $r, string $id) use ($db, $perms) {
            $perms->require($r->user() ?? [], 'automations.manage');
            $db->run('DELETE FROM automations WHERE id=?', [(int) $id]);
            PlatformResponse::json(['data' => ['ok' => true]]);
        }, $protected);

        $http->post('/admin/automations/{id}/run', static function (PlatformRequestInterface $r, string $id) use ($db, $perms, $engine) {
            $perms->require($r->user() ?? [], 'automations.run');
            $row = $db->one('SELECT * FROM automations WHERE id=?', [(int) $id]);
            if (!$row) {
                PlatformResponse::error('Not found', 404);
            }
            $context = $r->input('context') ?? $r->body();
            $runId = $engine->run($row, is_array($context) ? $context : [], bin2hex(random_bytes(16)));
            PlatformResponse::json(['data' => ['run_id' => $runId]]);
        }, $protected);

        $http->post('/admin/automations/{id}/test', static function (PlatformRequestInterface $r, string $id) use ($db, $perms, $engine) {
            $perms->require($r->user() ?? [], 'automations.run');
            $row = $db->one('SELECT * FROM automations WHERE id=?', [(int) $id]);
            if (!$row) {
                PlatformResponse::error('Not found', 404);
            }
            $context = $r->input('context') ?? [];
            $runId = $engine->run($row, is_array($context) ? $context : [], 'test-' . bin2hex(random_bytes(12)));
            PlatformResponse::json(['data' => ['run_id' => $runId, 'test' => true]]);
        }, $protected);

        $http->get('/admin/automations/{id}/runs', static function (PlatformRequestInterface $r, string $id) use ($db, $perms) {
            $perms->require($r->user() ?? [], 'automations.view');
            PlatformResponse::json(['data' => $db->all(
                'SELECT * FROM automation_runs WHERE automation_id=? ORDER BY id DESC LIMIT 100',
                [(int) $id]
            )]);
        }, $protected);
    }

    /**
     * @param array<string, mixed> $row
     * @return array<string, mixed>
     */
    public static function enrichRow(array $row, object $events): array
    {
        if ($row === []) {
            return $row;
        }
        $trigger = (string) ($row['trigger_type'] ?? '');
        $row['trigger_available'] = $trigger !== '' && $events->hasDeclared($trigger);
        return $row;
    }

    private static function status(mixed $value): string
    {
        $status = (string) $value;
        return in_array($status, ['draft', 'active', 'paused', 'archived'], true) ? $status : 'draft';
    }

    private static function definition(mixed $value): string
    {
        if (is_string($value)) {
            $decoded = json_decode($value, true);
            if (!is_array($decoded)) {
                PlatformResponse::error('Invalid definition JSON', 422);
            }
            $value = $decoded;
        }
        if (!is_array($value)) {
            $value = ['conditions' => [], 'steps' => []];
        }
        return json_encode($value, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) ?: '{}';
    }
}
