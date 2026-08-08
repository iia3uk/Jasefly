<?php
declare(strict_types=1);

namespace App\PackageModules\Forms;

use App\Platform\Contracts\PlatformDatabaseInterface;
use App\Platform\Contracts\PlatformRequestInterface;
use App\Platform\Package\AbstractPackageModule;
use App\Platform\Package\PlatformResponse;
use App\Platform\PlatformContext;

/**
 * Forms engine — installable package (extracted from bundled Modules/Forms).
 * Owns frozen builder widget ID: form.
 */
final class FormsModule extends AbstractPackageModule
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

    public function bootPlatform(PlatformContext $ctx): void
    {
        parent::bootPlatform($ctx);

        foreach ([
            'api.routes',
            'admin.pages',
            'permissions.check',
            'events.publish',
            'builder.widgets',
            'mail.send',
            'notifications.send',
            'http.client',
        ] as $cap) {
            $ctx->capabilities()->require($cap);
        }

        $http = $ctx->http();
        $db = $ctx->database();
        $events = $ctx->events();
        $perms = $ctx->permissions();
        $jwtSalt = (string) ($ctx->config()->get('jwt_secret') ?? '');

        $events->declare('form.submitted', [
            'label' => 'Отправлена форма сайта',
            'category' => 'forms',
            'payload' => ['form' => 'object', 'submission' => 'object'],
        ]);
        $events->declare('form.submission.status_changed', [
            'label' => 'Сменился статус заявки формы',
            'category' => 'forms',
            'payload' => ['submission_id' => 'int', 'status' => 'string'],
        ]);

        FormActionRegistry::bootDefaults(
            $ctx->mail(),
            $ctx->notifications(),
            $http,
            $db,
            $events,
        );

        $svc = static fn(): FormService => new FormService($db, $events, $jwtSalt);
        $protected = [$http->authMiddleware(), $http->permissionMiddleware()];
        $writeRate = $http->rateLimitMiddleware(20, 60);

        $http->get('/forms/{slug}', static function (PlatformRequestInterface $r, string $slug) use ($svc) {
            $form = $svc()->getBySlug($slug, true);
            if (!$form) {
                PlatformResponse::error('Not found', 404);
            }
            unset($form['actions']);
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
            PlatformResponse::json(['data' => [
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

        $http->post('/forms/{slug}/submit', static function (PlatformRequestInterface $r, string $slug) use ($svc) {
            $body = $r->body();
            $input = is_array($body) ? $body : [];
            $ip = $r->ip();
            $ua = (string) ($r->header('User-Agent') ?? '');
            $res = $svc()->submit($slug, $input, $ip !== '' ? $ip : null, $ua !== '' ? $ua : null);
            if (!$res['ok']) {
                PlatformResponse::json([
                    'success' => false,
                    'error' => $res['error'] ?? 'Error',
                    'errors' => $res['errors'] ?? [],
                ], ($res['error'] ?? '') === 'Form not found' ? 404 : 422);
            }
            PlatformResponse::json(['data' => $res['data']], 201);
        }, [$writeRate]);

        $http->get('/admin/forms', static function (PlatformRequestInterface $r) use ($db, $perms) {
            $perms->require($r->user() ?? [], 'forms.view');
            $rows = $db->all(
                "SELECT f.*, (SELECT COUNT(*) FROM form_submissions s WHERE s.form_id=f.id AND s.deleted_at IS NULL) submissions_count
                 FROM forms f WHERE f.deleted_at IS NULL ORDER BY f.id DESC"
            );
            PlatformResponse::json(['data' => $rows]);
        }, $protected);

        $http->post('/admin/forms', static function (PlatformRequestInterface $r) use ($db, $perms, $events, $svc) {
            $perms->require($r->user() ?? [], 'forms.manage');
            $name = trim((string) ($r->input('name') ?? 'Форма'));
            $slug = trim((string) ($r->input('slug') ?? ''));
            if ($slug === '') {
                $slug = preg_replace('/[^a-z0-9\-]+/', '-', strtolower($name)) ?: 'form';
            }
            $status = (string) ($r->input('status') ?? 'draft');
            if (!in_array($status, ['draft', 'active', 'disabled', 'archived'], true)) {
                $status = 'draft';
            }
            $user = $r->user() ?? [];
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
                    $user['id'] ?? $user['sub'] ?? null,
                ]
            );
            $id = $db->lastInsertId();
            self::syncFields($db, $id, $r->input('fields') ?? []);
            self::syncActions($db, $id, $r->input('actions') ?? [['type' => 'save_submission', 'is_active' => 1]]);
            $events->publish('form.created', ['form_id' => $id]);
            PlatformResponse::json(['data' => $svc()->getById($id)], 201);
        }, $protected);

        $http->get('/admin/forms/{id}', static function (PlatformRequestInterface $r, string $id) use ($perms, $svc) {
            $perms->require($r->user() ?? [], 'forms.view');
            $form = $svc()->getById((int) $id);
            if (!$form) {
                PlatformResponse::error('Not found', 404);
            }
            PlatformResponse::json(['data' => $form]);
        }, $protected);

        $http->put('/admin/forms/{id}', static function (PlatformRequestInterface $r, string $id) use ($db, $perms, $events, $svc) {
            $perms->require($r->user() ?? [], 'forms.manage');
            $form = $svc()->getById((int) $id);
            if (!$form) {
                PlatformResponse::error('Not found', 404);
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
                self::syncFields($db, (int) $id, $r->input('fields'));
            }
            if ($r->input('actions') !== null) {
                self::syncActions($db, (int) $id, $r->input('actions'));
            }
            $events->publish('form.updated', ['form_id' => (int) $id]);
            PlatformResponse::json(['data' => $svc()->getById((int) $id)]);
        }, $protected);

        $http->delete('/admin/forms/{id}', static function (PlatformRequestInterface $r, string $id) use ($db, $perms, $events) {
            $perms->require($r->user() ?? [], 'forms.manage');
            $db->run('UPDATE forms SET deleted_at=NOW(), status=\'archived\' WHERE id=?', [(int) $id]);
            $events->publish('form.deleted', ['form_id' => (int) $id]);
            PlatformResponse::json(['data' => ['ok' => true]]);
        }, $protected);

        $http->get('/admin/forms/{id}/submissions', static function (PlatformRequestInterface $r, string $id) use ($db, $perms) {
            $perms->require($r->user() ?? [], 'forms.submissions.view');
            $q = $r->query();
            $status = (string) ($q['status'] ?? '');
            $sql = 'SELECT id, public_id, form_id, status, page_url, created_at, updated_at FROM form_submissions WHERE form_id=? AND deleted_at IS NULL';
            $params = [(int) $id];
            if ($status !== '') {
                $sql .= ' AND status=?';
                $params[] = $status;
            }
            $sql .= ' ORDER BY id DESC LIMIT 200';
            PlatformResponse::json(['data' => $db->all($sql, $params)]);
        }, $protected);

        $http->get('/admin/forms/{id}/export', static function (PlatformRequestInterface $r, string $id) use ($db, $perms, $svc, $http) {
            $perms->require($r->user() ?? [], 'forms.export');
            $form = $svc()->getById((int) $id);
            if (!$form) {
                PlatformResponse::error('Not found', 404);
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
            $csv = "\xEF\xBB\xBF" . CsvExport::build($headers, $rows);
            $http->download('form-' . $form['slug'] . '-export.csv', $csv);
        }, $protected);

        $http->get('/admin/form-submissions', static function (PlatformRequestInterface $r) use ($db, $perms) {
            $perms->require($r->user() ?? [], 'forms.submissions.view');
            $q = $r->query();
            $formId = (int) ($q['form_id'] ?? 0);
            $status = (string) ($q['status'] ?? '');
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
            PlatformResponse::json(['data' => $db->all($sql, $params)]);
        }, $protected);

        $http->get('/admin/form-submissions/{id}', static function (PlatformRequestInterface $r, string $id) use ($db, $perms) {
            $perms->require($r->user() ?? [], 'forms.submissions.view');
            $sub = $db->one('SELECT * FROM form_submissions WHERE id=? AND deleted_at IS NULL', [(int) $id]);
            if (!$sub) {
                PlatformResponse::error('Not found', 404);
            }
            $sub['values'] = $db->all('SELECT * FROM form_submission_values WHERE submission_id=?', [(int) $id]);
            unset($sub['ip_hash'], $sub['ua_hash']);
            PlatformResponse::json(['data' => $sub]);
        }, $protected);

        $http->put('/admin/form-submissions/{id}', static function (PlatformRequestInterface $r, string $id) use ($db, $perms, $events) {
            $perms->require($r->user() ?? [], 'forms.submissions.manage');
            $sub = $db->one('SELECT * FROM form_submissions WHERE id=? AND deleted_at IS NULL', [(int) $id]);
            if (!$sub) {
                PlatformResponse::error('Not found', 404);
            }
            $status = (string) ($r->input('status') ?? $sub['status']);
            if (!in_array($status, ['new', 'in_progress', 'resolved', 'spam', 'archived'], true)) {
                PlatformResponse::error('Invalid status', 422);
            }
            $note = $r->input('internal_note');
            $db->run(
                'UPDATE form_submissions SET status=?, internal_note=COALESCE(?, internal_note) WHERE id=?',
                [$status, $note, (int) $id]
            );
            if ($status !== $sub['status']) {
                $events->publish('form.submission.status_changed', [
                    'submission_id' => (int) $id,
                    'public_id' => $sub['public_id'],
                    'from' => $sub['status'],
                    'to' => $status,
                ]);
            }
            PlatformResponse::json(['data' => ['ok' => true]]);
        }, $protected);

        $http->post('/admin/form-submissions/bulk-status', static function (PlatformRequestInterface $r) use ($db, $perms) {
            $perms->require($r->user() ?? [], 'forms.submissions.manage');
            $ids = $r->input('ids') ?? [];
            $status = (string) ($r->input('status') ?? '');
            if (!is_array($ids) || !in_array($status, ['new', 'in_progress', 'resolved', 'spam', 'archived'], true)) {
                PlatformResponse::error('Invalid payload', 422);
            }
            foreach ($ids as $sid) {
                $db->run('UPDATE form_submissions SET status=? WHERE id=? AND deleted_at IS NULL', [$status, (int) $sid]);
            }
            PlatformResponse::json(['data' => ['ok' => true, 'count' => count($ids)]]);
        }, $protected);

        $http->delete('/admin/form-submissions/{id}', static function (PlatformRequestInterface $r, string $id) use ($db, $perms, $events) {
            $perms->require($r->user() ?? [], 'forms.submissions.manage');
            $sub = $db->one('SELECT public_id FROM form_submissions WHERE id=?', [(int) $id]);
            $db->run('UPDATE form_submissions SET deleted_at=NOW(), status=\'archived\' WHERE id=?', [(int) $id]);
            $events->publish('form.submission.deleted', [
                'submission_id' => (int) $id,
                'public_id' => $sub['public_id'] ?? null,
            ]);
            PlatformResponse::json(['data' => ['ok' => true]]);
        }, $protected);
    }

    /** @param mixed $fields */
    private static function syncFields(PlatformDatabaseInterface $db, int $formId, mixed $fields): void
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
    private static function syncActions(PlatformDatabaseInterface $db, int $formId, mixed $actions): void
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
}
