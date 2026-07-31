<?php
declare(strict_types=1);

namespace App\PackageModules\Indexnow;

use App\Platform\Contracts\PlatformRequestInterface;
use App\Platform\Package\AbstractPackageModule;
use App\Platform\Package\PlatformResponse;
use App\Platform\PlatformContext;

final class IndexNowModule extends AbstractPackageModule
{
    public function name(): string
    {
        return 'indexnow';
    }

    public function label(): string
    {
        return 'IndexNow';
    }

    public function priority(): int
    {
        return 55;
    }

    public function adminNav(): array
    {
        return [[
            'group' => 'SEO',
            'path' => '/admin/indexnow',
            'label' => 'IndexNow',
            'permission' => 'indexnow.view',
            'icon' => 'radar',
        ]];
    }

    public function bootPlatform(PlatformContext $ctx): void
    {
        parent::bootPlatform($ctx);

        $ctx->capabilities()->require('http.client');
        $ctx->capabilities()->require('events.subscribe');

        $svc = static fn(): IndexNowService => new IndexNowService($ctx->database(), $ctx);

        $ctx->events()->subscribe('resource.afterSave', static function ($payload) use ($svc) {
            if (!is_array($payload)) {
                return null;
            }
            $svc()->onContentEvent('resource.afterSave', $payload);
            return null;
        }, 80);

        $ctx->events()->subscribe('resource.afterDelete', static function ($payload) use ($svc) {
            if (!is_array($payload)) {
                return null;
            }
            $svc()->onContentEvent('resource.afterDelete', $payload);
            return null;
        }, 80);

        $ctx->events()->subscribe('page.afterPublish', static function ($payload) use ($svc) {
            if (!is_array($payload)) {
                return null;
            }
            $svc()->onContentEvent('page.afterPublish', $payload);
            return null;
        }, 80);

        $http = $ctx->http();
        $perms = $ctx->permissions();
        $protected = [$http->authMiddleware(), $http->permissionMiddleware()];

        $http->get('/admin/indexnow/status', static function (PlatformRequestInterface $r) use ($perms, $svc) {
            $perms->require($r->user() ?? [], 'indexnow.view');
            PlatformResponse::json(['data' => $svc()->status()]);
        }, $protected);

        $http->get('/admin/indexnow/settings', static function (PlatformRequestInterface $r) use ($perms, $svc) {
            $perms->require($r->user() ?? [], 'indexnow.view');
            PlatformResponse::json(['data' => $svc()->getSettings()]);
        }, $protected);

        $http->put('/admin/indexnow/settings', static function (PlatformRequestInterface $r) use ($perms, $svc) {
            $perms->require($r->user() ?? [], 'indexnow.manage');
            $body = $r->body();
            if (!is_array($body)) {
                PlatformResponse::error('Invalid body', 422);
            }
            try {
                $saved = $svc()->saveSettings($body);
            } catch (\Throwable $e) {
                PlatformResponse::error($e->getMessage(), 422);
            }
            PlatformResponse::json(['data' => $saved, 'message' => 'Сохранено']);
        }, $protected);

        $http->post('/admin/indexnow/generate-key', static function (PlatformRequestInterface $r) use ($perms, $svc) {
            $perms->require($r->user() ?? [], 'indexnow.manage');
            $key = $svc()->generateKey();
            $saved = $svc()->saveSettings(['api_key' => $key]);
            PlatformResponse::json(['data' => $saved, 'message' => 'Ключ создан и файл размещён (если корень сайта доступен для записи)']);
        }, $protected);

        $http->post('/admin/indexnow/setup', static function (PlatformRequestInterface $r) use ($perms, $svc) {
            $perms->require($r->user() ?? [], 'indexnow.manage');
            $data = $svc()->quickSetup();
            PlatformResponse::json([
                'data' => $data,
                'message' => !empty($data['status']['ready'])
                    ? 'IndexNow настроен'
                    : 'Ключ создан; проверьте запись файла в корень сайта',
            ]);
        }, $protected);

        $http->post('/admin/indexnow/place-key', static function (PlatformRequestInterface $r) use ($perms, $svc) {
            $perms->require($r->user() ?? [], 'indexnow.manage');
            $s = $svc()->getSettings();
            $key = (string) ($s['api_key'] ?? '');
            if ($key === '') {
                PlatformResponse::error('Сначала задайте ключ', 422);
            }
            $ok = $svc()->placeKeyFile($key);
            PlatformResponse::json(['data' => $svc()->status(), 'message' => $ok ? 'Файл ключа записан' : 'Не удалось записать файл в корень сайта']);
        }, $protected);

        $http->post('/admin/indexnow/submit', static function (PlatformRequestInterface $r) use ($perms, $svc) {
            $perms->require($r->user() ?? [], 'indexnow.submit');
            $body = $r->body();
            $urls = null;
            if (is_array($body) && isset($body['urls']) && is_array($body['urls'])) {
                $urls = array_map('strval', $body['urls']);
            }
            $result = $svc()->submit($urls, 'manual');
            PlatformResponse::json(['data' => $result]);
        }, $protected);

        $http->post('/admin/indexnow/submit-all', static function (PlatformRequestInterface $r) use ($perms, $svc) {
            $perms->require($r->user() ?? [], 'indexnow.submit');
            $result = $svc()->submit(null, 'submit_all');
            PlatformResponse::json(['data' => $result]);
        }, $protected);

        $http->get('/admin/indexnow/log', static function (PlatformRequestInterface $r) use ($perms, $svc) {
            $perms->require($r->user() ?? [], 'indexnow.view');
            PlatformResponse::json(['data' => $svc()->listLog(80)]);
        }, $protected);

        $http->post('/admin/indexnow/clear-log', static function (PlatformRequestInterface $r) use ($perms, $svc) {
            $perms->require($r->user() ?? [], 'indexnow.manage');
            $svc()->clearLog();
            PlatformResponse::json(['data' => ['cleared' => true]]);
        }, $protected);
    }
}
