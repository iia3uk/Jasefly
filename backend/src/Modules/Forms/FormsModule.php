<?php
declare(strict_types=1);

namespace App\Modules\Forms;

use App\Core\AbstractModule;
use App\Core\Container;
use App\Core\EventDispatcher;
use App\Database;
use App\Middleware\AuthMiddleware;
use App\Middleware\PermissionMiddleware;
use App\Middleware\RateLimitMiddleware;
use App\Request;
use App\Response;
use App\Router;
use App\Services\ActivityLogService;
use App\Services\PermissionService;

final class FormsModule extends AbstractModule
{
    public function name(): string
    {
        return 'forms';
    }

    public function label(): string
    {
        return 'Формы';
    }

    public function priority(): int
    {
        return 35;
    }

    public function boot(Database $db, array $app): void
    {
        FormActionRegistry::bootDefaults();
    }

    public function blocks(): array
    {
        return [
            ['type' => 'form', 'label' => 'Форма', 'category' => 'basic'],
        ];
    }

    public function adminNav(): array
    {
        return [
            [
                'group' => 'Контент',
                'path' => '/admin/forms',
                'label' => 'Формы',
                'permission' => 'forms.view',
                'icon' => 'layout-template',
            ],
            [
                'group' => 'Контент',
                'path' => '/admin/form-submissions',
                'label' => 'Заявки форм',
                'permission' => 'forms.submissions.view',
                'icon' => 'mail',
            ],
        ];
    }

    public function registerRoutes(Router $router, Database $db, array $app, string $apiPrefix): void
    {
        $p = fn(string $path) => rtrim($apiPrefix, '/') . $path;
        $perms = new PermissionService($db);
        $protected = [new AuthMiddleware($app['jwt_secret']), new PermissionMiddleware($perms)];
        $writeRate = new RateLimitMiddleware($db, 20, 60);
        $activity = new ActivityLogService($db);
        $svc = new FormService($db, $app);

        // Public
        $router->get($p('/forms/{slug}'), function (Request $r, string $slug) use ($svc) {
            $form = $svc->getBySlug($slug, true);
            if (!$form) {
                Response::error('Not found', 404);
            }
            unset($form['actions']);
            // Public schema only
            $form['fields'] = array_map(static function ($f) {
                return [
                    'name' => $f['name'],
                    'label' => $f['label'],
                    'type' => $f['type'],
                    'placeholder' => $f['placeholder'],
                    'help_text' => $f['help_text'],
                    'default_value' => $f['default_value'],
                    'required' => (bool) $f['required'],
                    'options' => $f['options'],
                    'width' => $f['width'],
                    'visibility' => $f['visibility'],
                ];
            }, $form['fields'] ?? []);
            Response::json(['data' => [
                'id' => $form['id'],
                'name' => $form['name'],
                'slug' => $form['slug'],
                'description' => $form['description'],
                'success_message' => $form['success_message'],
                'submit_button_text' => $form['submit_button_text'],
                'fields' => $form['fields'],
                'settings' => [
                    'honeypot' => true,
                ],
            ]]);
        });

        $router->post($p('/forms/{slug}/submit'), function (Request $r, string $slug) use ($svc) {
            $ip = (string) ($r->ip() ?? '');
            $ua = (string) ($r->header('User-Agent') ?? '');
            $res = $svc->submit($slug, $r->all(), $ip !== '' ? $ip : null, $ua !== '' ? $ua : null);
            if (!$res['ok']) {
                Response::json([
                    'success' => false,
                    'error' => $res['error'] ?? 'Error',
                    'errors' => $res['errors'] ?? [],
                ], ($res['error'] ?? '') === 'Form not found' ? 404 : 422);
            }
            Response::json(['data' => $res['data']], 201);
        }, [$writeRate]);

        // Admin forms CRUD
        $router->get($p('/admin/forms'), function (Request $r) use ($db, $perms) {
            $perms->require($r->user, 'forms.view');
            $rows = $db->all(
                "SELECT f.*, (SELECT COUNT(*) FROM form_submissions s WHERE s.form_id=f.id AND s.deleted_at IS NULL) submissions_count
                 FROM forms f WHERE f.deleted_at IS NULL ORDER BY f.id DESC"
            );
            Response::json(['data' => $rows]);
        }, $protected);

        $router->post($p('/admin/forms'), function (Request $r) use ($db, $perms, $activity, $svc) {
            $perms->require($r->user, 'forms.manage');
            $name = trim((string) ($r->input('name') ?? 'Форма'));
            $slug = trim((string) ($r->input('slug') ?? ''));
            if ($slug === '') {
                $slug = preg_replace('/[^a-z0-9\-]+/', '-', strtolower($name)) ?: 'form';
            }
            $status = (string) ($r->input('status') ?? 'draft');
            if (!in_array($status, ['draft', 'active', 'disabled', 'archived'], true)) {
                $status = 'draft';
            }
            $db->run(
                'INSERT INTO forms (name, slug, description, status, success_message, redirect_url, submit_button_text, settings, created_by)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
                [
                    $name,
                    $slug,
                    $r->input('description'),
                    $status,
                    $r->input('success_message') ?? 'Спасибо!',
                    $r->input('redirect_url'),
                    $r->input('submit_button_text') ?? 'Отправить',
                    json_encode($r->input('settings') ?? ['honeypot' => true], JSON_UNESCAPED_UNICODE),
                    $r->user['id'] ?? $r->user['sub'] ?? null,
                ]
            );
            $id = (int) $db->id();
            $this->syncFields($db, $id, $r->input('fields') ?? []);
            $this->syncActions($db, $id, $r->input('actions') ?? [['type' => 'save_submission', 'is_active' => 1]]);
            $this->dispatch('form.created', ['form_id' => $id]);
            $activity->log($r, 'create', 'forms', $id, $name);
            Response::json(['data' => $svc->getById($id)], 201);
        }, $protected);

        $router->get($p('/admin/forms/{id}'), function (Request $r, string $id) use ($perms, $svc) {
            $perms->require($r->user, 'forms.view');
            $form = $svc->getById((int) $id);
            if (!$form) {
                Response::error('Not found', 404);
            }
            Response::json(['data' => $form]);
        }, $protected);

        $router->put($p('/admin/forms/{id}'), function (Request $r, string $id) use ($db, $perms, $activity, $svc) {
            $perms->require($r->user, 'forms.manage');
            $form = $svc->getById((int) $id);
            if (!$form) {
                Response::error('Not found', 404);
            }
            $status = (string) ($r->input('status') ?? $form['status']);
            if (!in_array($status, ['draft', 'active', 'disabled', 'archived'], true)) {
                $status = $form['status'];
            }
            $db->run(
                'UPDATE forms SET name=?, slug=?, description=?, status=?, success_message=?, redirect_url=?, submit_button_text=?, settings=? WHERE id=?',
                [
                    trim((string) ($r->input('name') ?? $form['name'])),
                    trim((string) ($r->input('slug') ?? $form['slug'])),
                    $r->input('description'),
                    $status,
                    $r->input('success_message'),
                    $r->input('redirect_url'),
                    $r->input('submit_button_text'),
                    json_encode($r->input('settings') ?? $form['settings'], JSON_UNESCAPED_UNICODE),
                    (int) $id,
                ]
            );
            if ($r->input('fields') !== null) {
                $this->syncFields($db, (int) $id, $r->input('fields'));
            }
            if ($r->input('actions') !== null) {
                $this->syncActions($db, (int) $id, $r->input('actions'));
            }
            $this->dispatch('form.updated', ['form_id' => (int) $id]);
            $activity->log($r, 'update', 'forms', (int) $id, $form['name']);
            Response::json(['data' => $svc->getById((int) $id)]);
        }, $protected);

        $router->delete($p('/admin/forms/{id}'), function (Request $r, string $id) use ($db, $perms, $activity) {
            $perms->require($r->user, 'forms.manage');
            $db->run('UPDATE forms SET deleted_at=NOW(), status=\'archived\' WHERE id=?', [(int) $id]);
            $this->dispatch('form.deleted', ['form_id' => (int) $id]);
            $activity->log($r, 'delete', 'forms', (int) $id, null);
            Response::json(['data' => ['ok' => true]]);
        }, $protected);

        $router->get($p('/admin/forms/{id}/submissions'), function (Request $r, string $id) use ($db, $perms) {
            $perms->require($r->user, 'forms.submissions.view');
            $status = (string) ($r->query('status') ?? '');
            $sql = 'SELECT id, public_id, form_id, status, page_url, created_at, updated_at FROM form_submissions WHERE form_id=? AND deleted_at IS NULL';
            $params = [(int) $id];
            if ($status !== '') {
                $sql .= ' AND status=?';
                $params[] = $status;
            }
            $sql .= ' ORDER BY id DESC LIMIT 200';
            Response::json(['data' => $db->all($sql, $params)]);
        }, $protected);

        $router->get($p('/admin/forms/{id}/export'), function (Request $r, string $id) use ($db, $perms, $svc) {
            $perms->require($r->user, 'forms.export');
            $form = $svc->getById((int) $id);
            if (!$form) {
                Response::error('Not found', 404);
            }
            $subs = $db->all(
                'SELECT * FROM form_submissions WHERE form_id=? AND deleted_at IS NULL ORDER BY id DESC LIMIT 5000',
                [(int) $id]
            );
            $fieldNames = array_map(static fn($f) => (string) $f['name'], $form['fields'] ?? []);
            $headers = array_merge(['public_id', 'status', 'created_at', 'page_url'], $fieldNames);
            $rows = [];
            foreach ($subs as $sub) {
                $vals = $db->all('SELECT field_name, value_text FROM form_submission_values WHERE submission_id=?', [(int) $sub['id']]);
                $map = [];
                foreach ($vals as $v) {
                    $map[$v['field_name']] = $v['value_text'];
                }
                $row = [$sub['public_id'], $sub['status'], $sub['created_at'], $sub['page_url']];
                foreach ($fieldNames as $fn) {
                    $row[] = $map[$fn] ?? '';
                }
                $rows[] = $row;
            }
            $csv = CsvExport::build($headers, $rows);
            header('Content-Type: text/csv; charset=utf-8');
            header('Content-Disposition: attachment; filename="form-' . $form['slug'] . '-export.csv"');
            echo "\xEF\xBB\xBF" . $csv;
            exit;
        }, $protected);

        $router->get($p('/admin/form-submissions'), function (Request $r) use ($db, $perms) {
            $perms->require($r->user, 'forms.submissions.view');
            $formId = (int) ($r->query('form_id') ?? 0);
            $status = (string) ($r->query('status') ?? '');
            $sql = 'SELECT s.id, s.public_id, s.form_id, s.status, s.page_url, s.created_at, f.name form_name, f.slug form_slug
                    FROM form_submissions s LEFT JOIN forms f ON f.id=s.form_id
                    WHERE s.deleted_at IS NULL';
            $params = [];
            if ($formId > 0) {
                $sql .= ' AND s.form_id=?';
                $params[] = $formId;
            }
            if ($status !== '') {
                $sql .= ' AND s.status=?';
                $params[] = $status;
            }
            $sql .= ' ORDER BY s.id DESC LIMIT 200';
            Response::json(['data' => $db->all($sql, $params)]);
        }, $protected);

        $router->get($p('/admin/form-submissions/{id}'), function (Request $r, string $id) use ($db, $perms) {
            $perms->require($r->user, 'forms.submissions.view');
            $sub = $db->one('SELECT * FROM form_submissions WHERE id=? AND deleted_at IS NULL', [(int) $id]);
            if (!$sub) {
                Response::error('Not found', 404);
            }
            $sub['values'] = $db->all('SELECT * FROM form_submission_values WHERE submission_id=?', [(int) $id]);
            unset($sub['ip_hash'], $sub['ua_hash']);
            Response::json(['data' => $sub]);
        }, $protected);

        $router->put($p('/admin/form-submissions/{id}'), function (Request $r, string $id) use ($db, $perms, $activity) {
            $perms->require($r->user, 'forms.submissions.manage');
            $sub = $db->one('SELECT * FROM form_submissions WHERE id=? AND deleted_at IS NULL', [(int) $id]);
            if (!$sub) {
                Response::error('Not found', 404);
            }
            $status = (string) ($r->input('status') ?? $sub['status']);
            if (!in_array($status, ['new', 'in_progress', 'resolved', 'spam', 'archived'], true)) {
                Response::error('Invalid status', 422);
            }
            $note = $r->input('internal_note');
            $db->run(
                'UPDATE form_submissions SET status=?, internal_note=COALESCE(?, internal_note) WHERE id=?',
                [$status, $note, (int) $id]
            );
            if ($status !== $sub['status']) {
                $this->dispatch('form.submission.status_changed', [
                    'submission_id' => (int) $id,
                    'public_id' => $sub['public_id'],
                    'from' => $sub['status'],
                    'to' => $status,
                ]);
            }
            $activity->log($r, 'update', 'form_submissions', (int) $id, $sub['public_id'], ['status' => $status]);
            Response::json(['data' => ['ok' => true]]);
        }, $protected);

        $router->post($p('/admin/form-submissions/bulk-status'), function (Request $r) use ($db, $perms) {
            $perms->require($r->user, 'forms.submissions.manage');
            $ids = $r->input('ids') ?? [];
            $status = (string) ($r->input('status') ?? '');
            if (!is_array($ids) || !in_array($status, ['new', 'in_progress', 'resolved', 'spam', 'archived'], true)) {
                Response::error('Invalid payload', 422);
            }
            foreach ($ids as $sid) {
                $db->run('UPDATE form_submissions SET status=? WHERE id=? AND deleted_at IS NULL', [$status, (int) $sid]);
            }
            Response::json(['data' => ['ok' => true, 'count' => count($ids)]]);
        }, $protected);

        $router->delete($p('/admin/form-submissions/{id}'), function (Request $r, string $id) use ($db, $perms, $activity) {
            $perms->require($r->user, 'forms.submissions.manage');
            $sub = $db->one('SELECT public_id FROM form_submissions WHERE id=?', [(int) $id]);
            $db->run('UPDATE form_submissions SET deleted_at=NOW(), status=\'archived\' WHERE id=?', [(int) $id]);
            $this->dispatch('form.submission.deleted', ['submission_id' => (int) $id, 'public_id' => $sub['public_id'] ?? null]);
            $activity->log($r, 'delete', 'form_submissions', (int) $id, $sub['public_id'] ?? null);
            Response::json(['data' => ['ok' => true]]);
        }, $protected);
    }

    /** @param mixed $fields */
    private function syncFields(Database $db, int $formId, mixed $fields): void
    {
        if (!is_array($fields)) {
            return;
        }
        $db->run('DELETE FROM form_fields WHERE form_id=?', [$formId]);
        $order = 0;
        foreach ($fields as $f) {
            if (!is_array($f) || empty($f['name'])) {
                continue;
            }
            $order += 10;
            $db->run(
                'INSERT INTO form_fields (form_id, name, label, type, placeholder, help_text, default_value, required, validation, options, width, sort_order, visibility)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                [
                    $formId,
                    (string) $f['name'],
                    (string) ($f['label'] ?? $f['name']),
                    (string) ($f['type'] ?? 'text'),
                    $f['placeholder'] ?? null,
                    $f['help_text'] ?? null,
                    isset($f['default_value']) ? (string) $f['default_value'] : null,
                    !empty($f['required']) ? 1 : 0,
                    json_encode($f['validation'] ?? new \stdClass(), JSON_UNESCAPED_UNICODE),
                    json_encode($f['options'] ?? null, JSON_UNESCAPED_UNICODE),
                    (string) ($f['width'] ?? 'full'),
                    (int) ($f['sort_order'] ?? $order),
                    json_encode($f['visibility'] ?? null, JSON_UNESCAPED_UNICODE),
                ]
            );
        }
    }

    /** @param mixed $actions */
    private function syncActions(Database $db, int $formId, mixed $actions): void
    {
        if (!is_array($actions)) {
            return;
        }
        $db->run('DELETE FROM form_actions WHERE form_id=?', [$formId]);
        $order = 0;
        foreach ($actions as $a) {
            if (!is_array($a) || empty($a['type'])) {
                continue;
            }
            $order += 10;
            $db->run(
                'INSERT INTO form_actions (form_id, type, config, sort_order, is_active) VALUES (?, ?, ?, ?, ?)',
                [
                    $formId,
                    (string) $a['type'],
                    json_encode($a['config'] ?? new \stdClass(), JSON_UNESCAPED_UNICODE),
                    (int) ($a['sort_order'] ?? $order),
                    isset($a['is_active']) ? ((int) (bool) $a['is_active']) : 1,
                ]
            );
        }
    }

    private function dispatch(string $event, array $payload): void
    {
        try {
            $c = Container::getInstance();
            if ($c->has(EventDispatcher::class)) {
                $c->get(EventDispatcher::class)->dispatch($event, $payload);
            }
        } catch (\Throwable) {
        }
    }
}
