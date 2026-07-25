<?php
declare(strict_types=1);

namespace App\PackageModules\FormsSdkReference;

use App\Platform\Contracts\PlatformRequestInterface;
use App\Platform\Package\AbstractPackageModule;
use App\Platform\Package\PlatformResponse;
use App\Platform\PlatformContext;

final class FormsSdkReferenceModule extends AbstractPackageModule
{
    public function name(): string
    {
        return 'forms-sdk-reference';
    }

    public function label(): string
    {
        return 'Forms SDK Reference';
    }

    public function priority(): int
    {
        return 36;
    }

    public function adminNav(): array
    {
        return [
            [
                'group' => 'Контент',
                'path' => '/admin/forms-sdk-reference',
                'label' => 'Forms SDK',
                'permission' => 'forms-ref.view',
                'icon' => 'layout-template',
            ],
            [
                'group' => 'Контент',
                'path' => '/admin/forms-sdk-reference/submissions',
                'label' => 'Заявки SDK Forms',
                'permission' => 'forms-ref.submissions.view',
                'icon' => 'mail',
            ],
        ];
    }

    public function bootPlatform(PlatformContext $ctx): void
    {
        parent::bootPlatform($ctx);

        foreach ([
            'http.client', 'api.routes', 'permissions.check', 'events.publish', 'settings.module',
        ] as $cap) {
            $ctx->capabilities()->require($cap);
        }

        if (!$ctx->capabilities()->has('mail.send')) {
            $ctx->health()->warn('Optional capability mail.send not available — email notifications disabled');
        }
        if (!$ctx->capabilities()->has('notifications.send')) {
            $ctx->health()->warn('Optional capability notifications.send not available — admin notifications disabled');
        }

        $repo = new FormRepository($ctx->database());
        $submit = new FormSubmitService($ctx, $repo);
        $http = $ctx->http();
        $perms = $ctx->permissions();
        $protected = [$http->authMiddleware(), $http->permissionMiddleware()];
        $writeRate = $http->rateLimitMiddleware(20, 60);

        $http->get('/forms-ref/{slug}', static function (PlatformRequestInterface $r, string $slug) use ($repo) {
            $form = $repo->getBySlug($slug, true);
            if (!$form) {
                PlatformResponse::error('Not found', 404);
            }
            $fields = array_map(static function (array $f): array {
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
                'fields' => $fields,
                'settings' => ['honeypot' => true],
            ]]);
        });

        $http->post('/forms-ref/{slug}/submit', static function (PlatformRequestInterface $r, string $slug) use ($submit) {
            $ip = $r->ip();
            $ua = (string) ($r->header('User-Agent') ?? '');
            $res = $submit->submit($slug, $r->body(), $ip !== '' ? $ip : null, $ua !== '' ? $ua : null);
            if (!$res['ok']) {
                PlatformResponse::json([
                    'success' => false,
                    'error' => $res['error'] ?? 'Error',
                    'errors' => $res['errors'] ?? [],
                ], ($res['error'] ?? '') === 'Form not found' ? 404 : 422);
            }
            PlatformResponse::json(['data' => $res['data']], 201);
        }, [$writeRate]);

        $http->get('/admin/forms-ref', static function (PlatformRequestInterface $r) use ($repo, $perms) {
            $perms->require($r->user() ?? [], 'forms-ref.view');
            PlatformResponse::json(['data' => $repo->listForms()]);
        }, $protected);

        $http->post('/admin/forms-ref', static function (PlatformRequestInterface $r) use ($repo, $perms, $ctx) {
            $perms->require($r->user() ?? [], 'forms-ref.manage');
            $fields = $r->input('fields') ?? [];
            if (!is_array($fields)) {
                $fields = [];
            }
            $id = $repo->create($r->body(), $fields);
            $ctx->events()->publish('forms-ref.created', ['form_id' => $id]);
            PlatformResponse::json(['data' => $repo->getById($id)], 201);
        }, $protected);

        $http->get('/admin/forms-ref/{id}', static function (PlatformRequestInterface $r, string $id) use ($repo, $perms) {
            $perms->require($r->user() ?? [], 'forms-ref.view');
            $form = $repo->getById((int) $id);
            if (!$form) {
                PlatformResponse::error('Not found', 404);
            }
            PlatformResponse::json(['data' => $form]);
        }, $protected);

        $http->put('/admin/forms-ref/{id}', static function (PlatformRequestInterface $r, string $id) use ($repo, $perms, $ctx) {
            $perms->require($r->user() ?? [], 'forms-ref.manage');
            $form = $repo->getById((int) $id);
            if (!$form) {
                PlatformResponse::error('Not found', 404);
            }
            $fields = $r->input('fields');
            $repo->update((int) $id, $r->body(), is_array($fields) ? $fields : null);
            $ctx->events()->publish('forms-ref.updated', ['form_id' => (int) $id]);
            PlatformResponse::json(['data' => $repo->getById((int) $id)]);
        }, $protected);

        $http->delete('/admin/forms-ref/{id}', static function (PlatformRequestInterface $r, string $id) use ($repo, $perms, $ctx) {
            $perms->require($r->user() ?? [], 'forms-ref.manage');
            $repo->delete((int) $id);
            $ctx->events()->publish('forms-ref.deleted', ['form_id' => (int) $id]);
            PlatformResponse::json(['data' => ['ok' => true]]);
        }, $protected);

        $http->get('/admin/forms-ref/{id}/submissions', static function (PlatformRequestInterface $r, string $id) use ($repo, $perms) {
            $perms->require($r->user() ?? [], 'forms-ref.submissions.view');
            $status = (string) (($r->query()['status'] ?? '') ?: '');
            PlatformResponse::json(['data' => $repo->listSubmissions((int) $id, $status)]);
        }, $protected);

        $http->get('/admin/forms-ref/{id}/export', static function (PlatformRequestInterface $r, string $id) use ($repo, $perms, $http) {
            $perms->require($r->user() ?? [], 'forms-ref.export');
            $form = $repo->getById((int) $id);
            if (!$form) {
                PlatformResponse::error('Not found', 404);
            }
            $subs = $repo->submissionsForExport((int) $id);
            $fieldNames = array_map(static fn(array $f): string => (string) $f['name'], $form['fields'] ?? []);
            $headers = array_merge(['public_id', 'status', 'created_at', 'page_url'], $fieldNames);
            $rows = [];
            foreach ($subs as $sub) {
                $map = $repo->submissionValueMap((int) $sub['id']);
                $row = [$sub['public_id'], $sub['status'], $sub['created_at'], $sub['page_url']];
                foreach ($fieldNames as $fn) {
                    $row[] = $map[$fn] ?? '';
                }
                $rows[] = $row;
            }
            $csv = "\xEF\xBB\xBF" . CsvExport::build($headers, $rows);
            $http->download('form-' . ($form['slug'] ?? 'export') . '-export.csv', $csv);
        }, $protected);

        $http->get('/admin/forms-ref-submissions', static function (PlatformRequestInterface $r) use ($repo, $perms) {
            $perms->require($r->user() ?? [], 'forms-ref.submissions.view');
            $q = $r->query();
            $formId = (int) ($q['form_id'] ?? 0);
            $status = (string) ($q['status'] ?? '');
            PlatformResponse::json(['data' => $repo->listSubmissions($formId, $status)]);
        }, $protected);

        $http->get('/admin/forms-ref-submissions/{id}', static function (PlatformRequestInterface $r, string $id) use ($repo, $perms) {
            $perms->require($r->user() ?? [], 'forms-ref.submissions.view');
            $sub = $repo->getSubmission((int) $id);
            if (!$sub) {
                PlatformResponse::error('Not found', 404);
            }
            PlatformResponse::json(['data' => $sub]);
        }, $protected);

        $http->put('/admin/forms-ref-submissions/{id}', static function (PlatformRequestInterface $r, string $id) use ($repo, $perms, $ctx) {
            $perms->require($r->user() ?? [], 'forms-ref.submissions.manage');
            $sub = $repo->getSubmission((int) $id);
            if (!$sub) {
                PlatformResponse::error('Not found', 404);
            }
            $status = (string) ($r->input('status') ?? $sub['status']);
            $note = $r->input('internal_note');
            $noteStr = $note !== null ? (string) $note : null;
            if (!$repo->updateSubmission((int) $id, $status, $noteStr)) {
                PlatformResponse::error('Invalid status', 422);
            }
            $ctx->events()->publish('forms-ref.submission.updated', [
                'submission_id' => (int) $id,
                'status' => $status,
            ]);
            PlatformResponse::json(['data' => ['ok' => true]]);
        }, $protected);

        $http->post('/admin/forms-ref-submissions/bulk-status', static function (PlatformRequestInterface $r) use ($repo, $perms) {
            $perms->require($r->user() ?? [], 'forms-ref.submissions.manage');
            $ids = $r->input('ids') ?? [];
            $status = (string) ($r->input('status') ?? '');
            if (!is_array($ids)) {
                PlatformResponse::error('Invalid payload', 422);
            }
            $count = $repo->bulkStatus($ids, $status);
            PlatformResponse::json(['data' => ['ok' => true, 'count' => $count]]);
        }, $protected);

        $http->delete('/admin/forms-ref-submissions/{id}', static function (PlatformRequestInterface $r, string $id) use ($repo, $perms) {
            $perms->require($r->user() ?? [], 'forms-ref.submissions.manage');
            $repo->deleteSubmission((int) $id);
            PlatformResponse::json(['data' => ['ok' => true]]);
        }, $protected);

        $http->get('/admin/forms-sdk-reference/ping', static function (PlatformRequestInterface $r) use ($perms) {
            $perms->require($r->user() ?? [], 'forms-ref.view');
            PlatformResponse::json(['data' => [
                'ok' => true,
                'module' => 'forms-sdk-reference',
                'message' => 'pong',
                'time' => gmdate(DATE_ATOM),
                'sdk' => 'platform',
            ]]);
        }, $protected);

        $http->get('/admin/forms-sdk-reference/health-report', static function (PlatformRequestInterface $r) use ($perms, $ctx) {
            $perms->require($r->user() ?? [], 'forms-ref.view');
            $report = $ctx->health()->checkModule($ctx->slug());
            PlatformResponse::json(['data' => $report]);
        }, $protected);
    }
}
