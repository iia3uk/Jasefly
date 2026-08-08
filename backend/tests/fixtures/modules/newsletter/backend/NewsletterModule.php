<?php
declare(strict_types=1);

namespace App\PackageModules\Newsletter;

use App\Platform\Contracts\PlatformRequestInterface;
use App\Platform\Package\AbstractPackageModule;
use App\Platform\Package\PlatformResponse;
use App\Platform\PlatformContext;

/**
 * Newsletter — installable package (extracted from bundled Modules/Newsletter).
 * Owns frozen builder widget ID: newsletter-signup.
 */
final class NewsletterModule extends AbstractPackageModule
{
    public function name(): string
    {
        return 'newsletter';
    }

    public function label(): string
    {
        return 'Рассылки';
    }

    public function priority(): int
    {
        return 36;
    }

    public function blocks(): array
    {
        return [['type' => 'newsletter-signup', 'label' => 'Подписка на рассылку', 'category' => 'basic']];
    }

    public function adminNav(): array
    {
        return [
            [
                'group' => 'Коммуникации',
                'path' => '/admin/newsletter/subscribers',
                'label' => 'Подписчики',
                'permission' => 'newsletter.view',
                'icon' => 'users',
            ],
            [
                'group' => 'Коммуникации',
                'path' => '/admin/newsletter/campaigns',
                'label' => 'Рассылки',
                'permission' => 'newsletter.view',
                'icon' => 'send',
            ],
        ];
    }

    public function bootPlatform(PlatformContext $ctx): void
    {
        parent::bootPlatform($ctx);

        foreach (['api.routes', 'admin.pages', 'permissions.check', 'scheduler.jobs', 'events.publish', 'builder.widgets'] as $cap) {
            $ctx->capabilities()->require($cap);
        }

        $http = $ctx->http();
        $db = $ctx->database();
        $perms = $ctx->permissions();
        $events = $ctx->events();
        $sched = $ctx->scheduler();
        $mail = $ctx->mail();
        $secret = (string) ($ctx->config()->get('jwt_secret') ?? '');
        $baseUrl = (string) ($ctx->config()->get('url') ?? $ctx->config()->get('public_url') ?? '');

        $events->declare('subscriber.created', [
            'label' => 'Новый подписчик рассылки',
            'category' => 'newsletter',
            'payload' => ['subscriber_id' => 'int', 'email' => 'string'],
        ]);

        $svc = static fn(): NewsletterService => new NewsletterService($db, $mail, $sched, $secret, $baseUrl);

        $sched->registerHandler('campaign.send', static function (array $payload) use ($svc): void {
            $svc()->sendCampaign(
                (int) ($payload['campaign_id'] ?? 0),
                (int) ($payload['offset'] ?? 0)
            );
        });

        $rate = $http->rateLimitMiddleware(10, 60);
        $protected = [$http->authMiddleware(), $http->permissionMiddleware()];

        $http->post('/newsletter/subscribe', static function (PlatformRequestInterface $r) use ($svc, $events) {
            try {
                $result = $svc()->subscribe(
                    (string) ($r->input('email') ?? ''),
                    (string) ($r->input('name') ?? ''),
                    ((int) ($r->input('list_id') ?? 0)) ?: null,
                    (string) ($r->input('source') ?? 'website')
                );
                $events->publish('subscriber.created', [
                    'subscriber_id' => $result['id'],
                    'email' => $r->input('email'),
                ]);
                PlatformResponse::json(['data' => ['status' => $result['status'], 'message' => 'Проверьте почту']], 201);
            } catch (\Throwable $e) {
                PlatformResponse::error($e->getMessage(), 422);
            }
        }, [$rate]);

        $http->get('/newsletter/confirm', static function (PlatformRequestInterface $r) use ($svc) {
            if (!$svc()->confirm((string) ($r->query()['token'] ?? ''))) {
                PlatformResponse::error('Invalid token', 422);
            }
            PlatformResponse::json(['data' => ['confirmed' => true]]);
        }, [$rate]);

        $http->get('/newsletter/unsubscribe', static function (PlatformRequestInterface $r) use ($svc) {
            if (!$svc()->unsubscribe((string) ($r->query()['token'] ?? ''))) {
                PlatformResponse::error('Invalid token', 422);
            }
            PlatformResponse::json(['data' => ['unsubscribed' => true]]);
        }, [$rate]);

        $http->get('/admin/newsletter/subscribers', static function (PlatformRequestInterface $r) use ($db, $perms) {
            $perms->require($r->user() ?? [], 'newsletter.view');
            PlatformResponse::json(['data' => $db->all('SELECT * FROM subscribers ORDER BY id DESC LIMIT 500')]);
        }, $protected);

        $http->post('/admin/newsletter/subscribers', static function (PlatformRequestInterface $r) use ($svc, $perms) {
            $perms->require($r->user() ?? [], 'newsletter.subscribers.manage');
            try {
                PlatformResponse::json(['data' => $svc()->subscribe(
                    (string) ($r->input('email') ?? ''),
                    (string) ($r->input('name') ?? ''),
                    ((int) ($r->input('list_id') ?? 0)) ?: null,
                    'admin'
                )], 201);
            } catch (\Throwable $e) {
                PlatformResponse::error($e->getMessage(), 422);
            }
        }, $protected);

        $http->put('/admin/newsletter/subscribers/{id}', static function (PlatformRequestInterface $r, string $id) use ($db, $perms) {
            $perms->require($r->user() ?? [], 'newsletter.subscribers.manage');
            $status = (string) ($r->input('status') ?? 'active');
            if (!in_array($status, ['pending', 'active', 'unsubscribed', 'bounced'], true)) {
                PlatformResponse::error('Invalid status', 422);
            }
            $db->run('UPDATE subscribers SET name=?,status=? WHERE id=?', [$r->input('name'), $status, (int) $id]);
            PlatformResponse::json(['data' => ['ok' => true]]);
        }, $protected);

        $http->delete('/admin/newsletter/subscribers/{id}', static function (PlatformRequestInterface $r, string $id) use ($db, $perms) {
            $perms->require($r->user() ?? [], 'newsletter.subscribers.manage');
            $db->run('DELETE FROM subscribers WHERE id=?', [(int) $id]);
            PlatformResponse::json(['data' => ['ok' => true]]);
        }, $protected);

        $http->post('/admin/newsletter/subscribers/import', static function (PlatformRequestInterface $r) use ($svc, $perms) {
            $perms->require($r->user() ?? [], 'newsletter.subscribers.manage');
            PlatformResponse::json(['data' => $svc()->importCsv(
                (string) ($r->input('csv') ?? ''),
                ((int) ($r->input('list_id') ?? 0)) ?: null
            )]);
        }, $protected);

        $http->get('/admin/newsletter/subscribers/export', static function (PlatformRequestInterface $r) use ($svc, $perms) {
            $perms->require($r->user() ?? [], 'newsletter.view');
            $q = $r->query();
            header('Content-Type: text/csv; charset=utf-8');
            header('Content-Disposition: attachment; filename="newsletter-subscribers.csv"');
            echo "\xEF\xBB\xBF" . $svc()->exportCsv(((int) ($q['list_id'] ?? 0)) ?: null);
            exit;
        }, $protected);

        $this->registerCrud($http, $db, $perms, $protected, 'lists');
        $this->registerCrud($http, $db, $perms, $protected, 'campaigns');

        $http->post('/admin/newsletter/campaigns/{id}/send', static function (PlatformRequestInterface $r, string $id) use ($svc, $perms) {
            $perms->require($r->user() ?? [], 'newsletter.send');
            $at = $r->input('scheduled_at');
            $when = is_string($at) && $at !== '' ? new \DateTimeImmutable($at) : null;
            PlatformResponse::json(['data' => ['job_id' => $svc()->scheduleCampaign((int) $id, $when)]]);
        }, $protected);

        $http->post('/admin/newsletter/campaigns/{id}/test', static function (PlatformRequestInterface $r, string $id) use ($svc, $perms) {
            $perms->require($r->user() ?? [], 'newsletter.send');
            try {
                $svc()->sendTest((int) $id, (string) ($r->input('email') ?? ''));
                PlatformResponse::json(['data' => ['ok' => true]]);
            } catch (\Throwable $e) {
                PlatformResponse::error($e->getMessage(), 422);
            }
        }, $protected);

        $http->post('/admin/newsletter/campaigns/{id}/pause', static function (PlatformRequestInterface $r, string $id) use ($db, $perms) {
            $perms->require($r->user() ?? [], 'newsletter.send');
            $db->run("UPDATE newsletter_campaigns SET status='paused' WHERE id=?", [(int) $id]);
            PlatformResponse::json(['data' => ['ok' => true]]);
        }, $protected);
    }

    /**
     * @param list<object> $protected
     */
    private function registerCrud(
        \App\Platform\Contracts\PlatformHttpInterface $http,
        \App\Platform\Contracts\PlatformDatabaseInterface $db,
        \App\Platform\Contracts\PlatformPermissionsInterface $perms,
        array $protected,
        string $kind,
    ): void {
        $table = $kind === 'lists' ? 'subscriber_lists' : 'newsletter_campaigns';
        $base = '/admin/newsletter/' . $kind;

        $http->get($base, static function (PlatformRequestInterface $r) use ($db, $perms, $table) {
            $perms->require($r->user() ?? [], 'newsletter.view');
            PlatformResponse::json(['data' => $db->all("SELECT * FROM {$table} ORDER BY id DESC")]);
        }, $protected);

        $http->post($base, static function (PlatformRequestInterface $r) use ($db, $perms, $kind) {
            $perms->require($r->user() ?? [], 'newsletter.manage');
            if ($kind === 'lists') {
                $db->run('INSERT INTO subscriber_lists (name,description) VALUES (?,?)', [
                    $r->input('name'),
                    $r->input('description'),
                ]);
            } else {
                $user = $r->user() ?? [];
                $db->run(
                    'INSERT INTO newsletter_campaigns (name,subject,html,text_body,list_id,created_by) VALUES (?,?,?,?,?,?)',
                    [
                        $r->input('name'),
                        $r->input('subject'),
                        $r->input('html') ?? '',
                        $r->input('text_body'),
                        ((int) ($r->input('list_id') ?? 0)) ?: null,
                        $user['sub'] ?? null,
                    ]
                );
            }
            PlatformResponse::json(['data' => ['id' => (int) $db->lastInsertId()]], 201);
        }, $protected);

        $http->put($base . '/{id}', static function (PlatformRequestInterface $r, string $id) use ($db, $perms, $kind) {
            $perms->require($r->user() ?? [], 'newsletter.manage');
            if ($kind === 'lists') {
                $db->run('UPDATE subscriber_lists SET name=?,description=? WHERE id=?', [
                    $r->input('name'),
                    $r->input('description'),
                    (int) $id,
                ]);
            } else {
                $db->run(
                    'UPDATE newsletter_campaigns SET name=?,subject=?,html=?,text_body=?,list_id=? WHERE id=?',
                    [
                        $r->input('name'),
                        $r->input('subject'),
                        $r->input('html') ?? '',
                        $r->input('text_body'),
                        ((int) ($r->input('list_id') ?? 0)) ?: null,
                        (int) $id,
                    ]
                );
            }
            PlatformResponse::json(['data' => ['ok' => true]]);
        }, $protected);

        $http->delete($base . '/{id}', static function (PlatformRequestInterface $r, string $id) use ($db, $perms, $table) {
            $perms->require($r->user() ?? [], 'newsletter.manage');
            $db->run("DELETE FROM {$table} WHERE id=?", [(int) $id]);
            PlatformResponse::json(['data' => ['ok' => true]]);
        }, $protected);
    }
}
