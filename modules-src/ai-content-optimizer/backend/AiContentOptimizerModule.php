<?php
declare(strict_types=1);

namespace App\PackageModules\AiContentOptimizer;

use App\Platform\Contracts\PlatformRequestInterface;
use App\Platform\Package\AbstractPackageModule;
use App\Platform\Package\PlatformResponse;
use App\Platform\PlatformContext;

final class AiContentOptimizerModule extends AbstractPackageModule
{
    public function name(): string
    {
        return 'ai-content-optimizer';
    }

    public function label(): string
    {
        return 'AI Content Optimizer';
    }

    public function priority(): int
    {
        return 85;
    }

    public function adminNav(): array
    {
        return [[
            'group' => 'Контент',
            'path' => '/admin/ai-content-optimizer',
            'label' => 'AI Optimizer',
            'permission' => 'ai-content-optimizer.view',
            'icon' => 'sparkles',
        ]];
    }

    public function bootPlatform(PlatformContext $ctx): void
    {
        parent::bootPlatform($ctx);

        $ctx->capabilities()->require('http.client');
        $ctx->capabilities()->require('scheduler.jobs');

        $svc = static fn(): OptimizerService => new OptimizerService($ctx->database());

        $ctx->scheduler()->registerHandler('tick', static function (array $payload) use ($svc): array {
            $settings = $svc()->getSettings();
            if (!(int) ($settings['cron_enabled'] ?? 0)) {
                return ['skipped' => true, 'reason' => 'cron_disabled'];
            }
            return $svc()->run(null, max(1, (int) ($settings['batch_size'] ?? 1)));
        });

        $http = $ctx->http();
        $perms = $ctx->permissions();
        $protected = [$http->authMiddleware(), $http->permissionMiddleware()];

        $http->get('/admin/ai-content-optimizer/meta', static function (PlatformRequestInterface $r) use ($perms) {
            $perms->require($r->user() ?? [], 'ai-content-optimizer.view');
            PlatformResponse::json(['data' => [
                'content_types' => ContentCatalog::types(),
                'field_modes' => [
                    ['id' => 'keep', 'label' => 'Не изменять'],
                    ['id' => 'always', 'label' => 'Изменять всегда'],
                    ['id' => 'if_better', 'label' => 'Изменять только если лучше'],
                ],
                'field_keys' => [
                    ['id' => 'title', 'label' => 'Заголовок записи'],
                    ['id' => 'seo_title', 'label' => 'SEO Title'],
                    ['id' => 'seo_description', 'label' => 'SEO Description'],
                    ['id' => 'seo_keywords', 'label' => 'SEO Keywords'],
                    ['id' => 'excerpt', 'label' => 'Анонс'],
                    ['id' => 'content', 'label' => 'Полный текст'],
                ],
                'prompt_vars' => [
                    '{article_id}', '{article_title}', '{article_text}',
                    '{site_name}', '{current_date}', '{source_length}',
                ],
            ]]);
        }, $protected);

        $http->get('/admin/ai-content-optimizer/settings', static function (PlatformRequestInterface $r) use ($perms, $svc) {
            $perms->require($r->user() ?? [], 'ai-content-optimizer.view');
            $s = $svc()->getSettings();
            // Mask key secrets in UI list (show last 4)
            $rawKeys = (string) ($s['api_keys'] ?? '');
            $masked = [];
            foreach (preg_split('/\R+/', $rawKeys) ?: [] as $line) {
                $line = trim($line);
                if ($line === '') {
                    continue;
                }
                $masked[] = strlen($line) > 8 ? (str_repeat('•', max(0, strlen($line) - 4)) . substr($line, -4)) : '••••';
            }
            $s['api_keys_masked'] = $masked;
            // Keep full keys for manage permission round-trip — client sends back only if changed
            PlatformResponse::json(['data' => $s]);
        }, $protected);

        $http->put('/admin/ai-content-optimizer/settings', static function (PlatformRequestInterface $r) use ($perms, $svc) {
            $perms->require($r->user() ?? [], 'ai-content-optimizer.manage');
            $body = $r->body();
            if (!is_array($body)) {
                PlatformResponse::error('Invalid body', 422);
            }
            $prev = $svc()->getSettings();
            if (isset($body['api_keys']) && is_string($body['api_keys']) && str_contains($body['api_keys'], '•')) {
                $body['api_keys'] = $prev['api_keys'] ?? '';
            }
            if (isset($body['proxy_pass']) && $body['proxy_pass'] === '********') {
                $body['proxy_pass'] = $prev['proxy_pass'] ?? '';
            }
            $svc()->saveSettings($body);
            PlatformResponse::json(['data' => $svc()->getSettings(), 'message' => 'Сохранено']);
        }, $protected);

        $http->get('/admin/ai-content-optimizer/profiles', static function (PlatformRequestInterface $r) use ($perms, $svc) {
            $perms->require($r->user() ?? [], 'ai-content-optimizer.view');
            PlatformResponse::json(['data' => $svc()->listProfiles()]);
        }, $protected);

        $http->post('/admin/ai-content-optimizer/profiles', static function (PlatformRequestInterface $r) use ($perms, $svc) {
            $perms->require($r->user() ?? [], 'ai-content-optimizer.manage');
            $body = $r->body();
            $id = $svc()->saveProfile(null, is_array($body) ? $body : []);
            PlatformResponse::json(['data' => ['id' => $id]], 201);
        }, $protected);

        $http->put('/admin/ai-content-optimizer/profiles/{id}', static function (PlatformRequestInterface $r, string $id) use ($perms, $svc) {
            $perms->require($r->user() ?? [], 'ai-content-optimizer.manage');
            $body = $r->body();
            $saved = $svc()->saveProfile((int) $id, is_array($body) ? $body : []);
            PlatformResponse::json(['data' => ['id' => $saved]]);
        }, $protected);

        $http->delete('/admin/ai-content-optimizer/profiles/{id}', static function (PlatformRequestInterface $r, string $id) use ($perms, $svc) {
            $perms->require($r->user() ?? [], 'ai-content-optimizer.manage');
            $svc()->deleteProfile((int) $id);
            PlatformResponse::json(['data' => ['ok' => true]]);
        }, $protected);

        $http->post('/admin/ai-content-optimizer/run', static function (PlatformRequestInterface $r) use ($perms, $svc) {
            $perms->require($r->user() ?? [], 'ai-content-optimizer.run');
            $body = $r->body();
            $profileId = isset($body['profile_id']) ? (int) $body['profile_id'] : null;
            $limit = isset($body['limit']) ? (int) $body['limit'] : null;
            PlatformResponse::json(['data' => $svc()->run($profileId ?: null, $limit)]);
        }, $protected);

        $http->get('/admin/ai-content-optimizer/log', static function (PlatformRequestInterface $r) use ($perms, $svc) {
            $perms->require($r->user() ?? [], 'ai-content-optimizer.view');
            $limit = (int) (($r->query()['limit'] ?? 50) ?: 50);
            PlatformResponse::json(['data' => $svc()->listLog($limit)]);
        }, $protected);

        $http->get('/admin/ai-content-optimizer/log/{id}', static function (PlatformRequestInterface $r, string $id) use ($perms, $svc) {
            $perms->require($r->user() ?? [], 'ai-content-optimizer.view');
            $row = $svc()->getLogDetail((int) $id);
            if (!$row) {
                PlatformResponse::error('Not found', 404);
            }
            PlatformResponse::json(['data' => $row]);
        }, $protected);

        $http->get('/admin/ai-content-optimizer/backups/{id}', static function (PlatformRequestInterface $r, string $id) use ($perms, $svc) {
            $perms->require($r->user() ?? [], 'ai-content-optimizer.view');
            $row = $svc()->getBackup((int) $id);
            if (!$row) {
                PlatformResponse::error('Not found', 404);
            }
            PlatformResponse::json(['data' => $row]);
        }, $protected);
    }
}
