<?php
declare(strict_types=1);

namespace App\Modules\Newsletter;

use App\Core\AbstractModule;
use App\Core\Container;
use App\Core\EventDispatcher;
use App\Database;
use App\Middleware\AuthMiddleware;
use App\Middleware\PermissionMiddleware;
use App\Middleware\RateLimitMiddleware;
use App\Modules\Scheduler\JobHandlerRegistry;
use App\Request;
use App\Response;
use App\Router;
use App\Services\PermissionService;

final class NewsletterModule extends AbstractModule
{
    public function name(): string { return 'newsletter'; }
    public function label(): string { return 'Рассылки'; }
    public function priority(): int { return 36; }
    // Enablement via PluginStateService / modules.is_enabled (default-off).
    public function blocks(): array
    {
        return [['type' => 'newsletter-signup', 'label' => 'Подписка на рассылку', 'category' => 'basic']];
    }
    public function adminNav(): array
    {
        return [
            ['group' => 'Коммуникации', 'path' => '/admin/newsletter/subscribers', 'label' => 'Подписчики',
                'permission' => 'newsletter.view', 'icon' => 'users'],
            ['group' => 'Коммуникации', 'path' => '/admin/newsletter/campaigns', 'label' => 'Рассылки',
                'permission' => 'newsletter.view', 'icon' => 'send'],
        ];
    }

    public function boot(Database $db, array $app): void
    {
        JobHandlerRegistry::register('newsletter.campaign.send', static function (array $payload) use ($db, $app): void {
            (new NewsletterService($db, $app))->sendCampaign(
                (int) ($payload['campaign_id'] ?? 0), (int) ($payload['offset'] ?? 0)
            );
        });
    }

    public function registerRoutes(Router $router, Database $db, array $app, string $apiPrefix): void
    {
        $p = fn(string $path) => rtrim($apiPrefix, '/') . $path;
        $svc = new NewsletterService($db, $app);
        $perms = new PermissionService($db);
        $protected = [new AuthMiddleware($app['jwt_secret']), new PermissionMiddleware($perms)];
        $rate = new RateLimitMiddleware($db, 10, 60);

        $router->post($p('/newsletter/subscribe'), function (Request $r) use ($svc) {
            try {
                $result = $svc->subscribe(
                    (string) $r->input('email'), (string) ($r->input('name') ?? ''),
                    ((int) ($r->input('list_id') ?? 0)) ?: null, (string) ($r->input('source') ?? 'website')
                );
                $this->dispatch('subscriber.created', ['subscriber_id' => $result['id'], 'email' => $r->input('email')]);
                Response::json(['data' => ['status' => $result['status'], 'message' => 'Проверьте почту']], 201);
            } catch (\Throwable $e) {
                Response::error($e->getMessage(), 422);
            }
        }, [$rate]);
        $router->get($p('/newsletter/confirm'), function (Request $r) use ($svc) {
            if (!$svc->confirm((string) ($r->query('token') ?? ''))) Response::error('Invalid token', 422);
            Response::json(['data' => ['confirmed' => true]]);
        }, [$rate]);
        $router->get($p('/newsletter/unsubscribe'), function (Request $r) use ($svc) {
            if (!$svc->unsubscribe((string) ($r->query('token') ?? ''))) Response::error('Invalid token', 422);
            Response::json(['data' => ['unsubscribed' => true]]);
        }, [$rate]);

        $router->get($p('/admin/newsletter/subscribers'), function (Request $r) use ($db, $perms) {
            $perms->require($r->user, 'newsletter.view');
            Response::json(['data' => $db->all('SELECT * FROM subscribers ORDER BY id DESC LIMIT 500')]);
        }, $protected);
        $router->post($p('/admin/newsletter/subscribers'), function (Request $r) use ($svc, $perms) {
            $perms->require($r->user, 'newsletter.subscribers.manage');
            try {
                Response::json(['data' => $svc->subscribe(
                    (string) $r->input('email'), (string) ($r->input('name') ?? ''),
                    ((int) ($r->input('list_id') ?? 0)) ?: null, 'admin'
                )], 201);
            } catch (\Throwable $e) { Response::error($e->getMessage(), 422); }
        }, $protected);
        $router->put($p('/admin/newsletter/subscribers/{id}'), function (Request $r, string $id) use ($db, $perms) {
            $perms->require($r->user, 'newsletter.subscribers.manage');
            $status = (string) ($r->input('status') ?? 'active');
            if (!in_array($status, ['pending','active','unsubscribed','bounced'], true)) Response::error('Invalid status', 422);
            $db->run('UPDATE subscribers SET name=?,status=? WHERE id=?', [$r->input('name'), $status, (int) $id]);
            Response::json(['data' => ['ok' => true]]);
        }, $protected);
        $router->delete($p('/admin/newsletter/subscribers/{id}'), function (Request $r, string $id) use ($db, $perms) {
            $perms->require($r->user, 'newsletter.subscribers.manage');
            $db->run('DELETE FROM subscribers WHERE id=?', [(int) $id]);
            Response::json(['data' => ['ok' => true]]);
        }, $protected);
        $router->post($p('/admin/newsletter/subscribers/import'), function (Request $r) use ($svc, $perms) {
            $perms->require($r->user, 'newsletter.subscribers.manage');
            Response::json(['data' => $svc->importCsv(
                (string) $r->input('csv'), ((int) ($r->input('list_id') ?? 0)) ?: null
            )]);
        }, $protected);
        $router->get($p('/admin/newsletter/subscribers/export'), function (Request $r) use ($svc, $perms) {
            $perms->require($r->user, 'newsletter.view');
            header('Content-Type: text/csv; charset=utf-8');
            header('Content-Disposition: attachment; filename="newsletter-subscribers.csv"');
            echo "\xEF\xBB\xBF" . $svc->exportCsv(((int) ($r->query('list_id') ?? 0)) ?: null);
            exit;
        }, $protected);

        $this->crudRoutes($router, $db, $perms, $protected, $p, 'lists');
        $this->crudRoutes($router, $db, $perms, $protected, $p, 'campaigns');
        $router->post($p('/admin/newsletter/campaigns/{id}/send'), function (Request $r, string $id) use ($svc, $perms) {
            $perms->require($r->user, 'newsletter.send');
            $at = $r->input('scheduled_at');
            $when = is_string($at) && $at !== '' ? new \DateTimeImmutable($at) : null;
            Response::json(['data' => ['job_id' => $svc->scheduleCampaign((int) $id, $when)]]);
        }, $protected);
        $router->post($p('/admin/newsletter/campaigns/{id}/test'), function (Request $r, string $id) use ($svc, $perms) {
            $perms->require($r->user, 'newsletter.send');
            try {
                $svc->sendTest((int) $id, (string) $r->input('email'));
                Response::json(['data' => ['ok' => true]]);
            } catch (\Throwable $e) { Response::error($e->getMessage(), 422); }
        }, $protected);
        $router->post($p('/admin/newsletter/campaigns/{id}/pause'), function (Request $r, string $id) use ($db, $perms) {
            $perms->require($r->user, 'newsletter.send');
            $db->run("UPDATE newsletter_campaigns SET status='paused' WHERE id=?", [(int) $id]);
            Response::json(['data' => ['ok' => true]]);
        }, $protected);
    }

    private function crudRoutes(Router $router, Database $db, PermissionService $perms, array $protected, callable $p, string $kind): void
    {
        $table = $kind === 'lists' ? 'subscriber_lists' : 'newsletter_campaigns';
        $base = '/admin/newsletter/' . $kind;
        $router->get($p($base), function (Request $r) use ($db, $perms, $table) {
            $perms->require($r->user, 'newsletter.view');
            Response::json(['data' => $db->all("SELECT * FROM {$table} ORDER BY id DESC")]);
        }, $protected);
        $router->post($p($base), function (Request $r) use ($db, $perms, $kind) {
            $perms->require($r->user, 'newsletter.manage');
            if ($kind === 'lists') {
                $db->run('INSERT INTO subscriber_lists (name,description) VALUES (?,?)', [$r->input('name'), $r->input('description')]);
            } else {
                $db->run(
                    'INSERT INTO newsletter_campaigns (name,subject,html,text_body,list_id,created_by) VALUES (?,?,?,?,?,?)',
                    [$r->input('name'), $r->input('subject'), $r->input('html') ?? '', $r->input('text_body'),
                        ((int) ($r->input('list_id') ?? 0)) ?: null, $r->user['sub'] ?? null]
                );
            }
            Response::json(['data' => ['id' => (int) $db->id()]], 201);
        }, $protected);
        $router->put($p($base . '/{id}'), function (Request $r, string $id) use ($db, $perms, $kind) {
            $perms->require($r->user, 'newsletter.manage');
            if ($kind === 'lists') {
                $db->run('UPDATE subscriber_lists SET name=?,description=? WHERE id=?', [$r->input('name'), $r->input('description'), (int) $id]);
            } else {
                $db->run(
                    'UPDATE newsletter_campaigns SET name=?,subject=?,html=?,text_body=?,list_id=? WHERE id=?',
                    [$r->input('name'), $r->input('subject'), $r->input('html') ?? '', $r->input('text_body'),
                        ((int) ($r->input('list_id') ?? 0)) ?: null, (int) $id]
                );
            }
            Response::json(['data' => ['ok' => true]]);
        }, $protected);
        $router->delete($p($base . '/{id}'), function (Request $r, string $id) use ($db, $perms, $table) {
            $perms->require($r->user, 'newsletter.manage');
            $db->run("DELETE FROM {$table} WHERE id=?", [(int) $id]);
            Response::json(['data' => ['ok' => true]]);
        }, $protected);
    }

    private function dispatch(string $event, array $payload): void
    {
        try { Container::getInstance()->get(EventDispatcher::class)->dispatch($event, $payload); } catch (\Throwable) {}
    }
}
