<?php
declare(strict_types=1);

namespace App\PackageModules\CookieConsent;

use App\Platform\Contracts\PlatformRequestInterface;
use App\Platform\Package\AbstractPackageModule;
use App\Platform\Package\PlatformResponse;
use App\Platform\PlatformContext;

final class CookieConsentModule extends AbstractPackageModule
{
    public function name(): string
    {
        return 'cookie-consent';
    }

    public function label(): string
    {
        return 'Cookie Consent';
    }

    public function priority(): int
    {
        return 45;
    }

    public function adminNav(): array
    {
        return [[
            'group' => 'SEO',
            'path' => '/admin/cookie-consent',
            'label' => 'Cookie Consent',
            'permission' => 'cookie-consent.view',
            'icon' => 'cookie',
        ]];
    }

    public function bootPlatform(PlatformContext $ctx): void
    {
        parent::bootPlatform($ctx);

        $svc = static fn(): ConsentService => new ConsentService($ctx->database());

        try {
            $ctx->scheduler()->registerHandler('purge', static function (array $payload) use ($svc): array {
                return $svc()->purgeOldLogs(
                    isset($payload['days']) ? (int) $payload['days'] : null
                );
            });
        } catch (\Throwable) {
            // scheduler optional
        }

        $http = $ctx->http();
        $perms = $ctx->permissions();
        $protected = [$http->authMiddleware(), $http->permissionMiddleware()];

        // Public: config + log consent (no auth)
        $http->get('/cookie-consent/config', static function () use ($svc) {
            PlatformResponse::json(['data' => $svc()->publicConfig()]);
        });

        $http->post('/cookie-consent/log', static function (PlatformRequestInterface $r) use ($svc) {
            $body = $r->body();
            if (!is_array($body)) {
                PlatformResponse::error('Invalid body', 422);
            }
            $cats = $body['categories'] ?? [];
            if (!is_array($cats)) {
                $cats = [];
            }
            $flat = [];
            foreach ($cats as $k => $v) {
                if (is_string($k)) {
                    $flat[$k] = (bool) $v;
                } elseif (is_array($v) && isset($v['id'])) {
                    $flat[(string) $v['id']] = (bool) ($v['enabled'] ?? $v['value'] ?? false);
                }
            }
            $result = $svc()->logConsent(
                $flat,
                (string) ($body['source'] ?? 'banner'),
                (string) ($body['policy_version'] ?? ''),
                (string) ($body['visitor_key'] ?? ''),
                isset($_SERVER['HTTP_USER_AGENT']) ? (string) $_SERVER['HTTP_USER_AGENT'] : null,
                isset($_SERVER['REMOTE_ADDR']) ? (string) $_SERVER['REMOTE_ADDR'] : null,
            );
            PlatformResponse::json(['data' => $result]);
        });

        $http->get('/admin/cookie-consent/settings', static function (PlatformRequestInterface $r) use ($perms, $svc) {
            $perms->require($r->user() ?? [], 'cookie-consent.view');
            PlatformResponse::json(['data' => $svc()->getSettings()]);
        }, $protected);

        $http->put('/admin/cookie-consent/settings', static function (PlatformRequestInterface $r) use ($perms, $svc) {
            $perms->require($r->user() ?? [], 'cookie-consent.manage');
            $body = $r->body();
            if (!is_array($body)) {
                PlatformResponse::error('Invalid body', 422);
            }
            PlatformResponse::json(['data' => $svc()->saveSettings($body), 'message' => 'Сохранено']);
        }, $protected);

        $http->get('/admin/cookie-consent/log', static function (PlatformRequestInterface $r) use ($perms, $svc) {
            $perms->require($r->user() ?? [], 'cookie-consent.view');
            $q = $r->query();
            $limit = isset($q['limit']) ? (int) $q['limit'] : 100;
            $offset = isset($q['offset']) ? (int) $q['offset'] : 0;
            PlatformResponse::json(['data' => $svc()->listLog($limit, $offset)]);
        }, $protected);

        $http->get('/admin/cookie-consent/stats', static function (PlatformRequestInterface $r) use ($perms, $svc) {
            $perms->require($r->user() ?? [], 'cookie-consent.view');
            PlatformResponse::json(['data' => $svc()->stats()]);
        }, $protected);

        $http->get('/admin/cookie-consent/export', static function (PlatformRequestInterface $r) use ($perms, $svc) {
            $perms->require($r->user() ?? [], 'cookie-consent.export');
            $q = $r->query();
            $fmt = strtolower((string) ($q['format'] ?? 'csv'));
            if ($fmt === 'xlsx' || $fmt === 'xls') {
                $body = $svc()->exportXlsxXml();
                header('Content-Type: application/vnd.ms-excel; charset=utf-8');
                header('Content-Disposition: attachment; filename="cookie-consents.xls"');
                echo $body;
                exit;
            }
            $csv = $svc()->exportCsv();
            header('Content-Type: text/csv; charset=utf-8');
            header('Content-Disposition: attachment; filename="cookie-consents.csv"');
            echo $csv;
            exit;
        }, $protected);

        $http->post('/admin/cookie-consent/purge', static function (PlatformRequestInterface $r) use ($perms, $svc) {
            $perms->require($r->user() ?? [], 'cookie-consent.manage');
            $body = $r->body();
            $days = is_array($body) && isset($body['days']) ? (int) $body['days'] : null;
            PlatformResponse::json(['data' => $svc()->purgeOldLogs($days)]);
        }, $protected);

        $http->get('/admin/cookie-consent/presets', static function (PlatformRequestInterface $r) use ($perms) {
            $perms->require($r->user() ?? [], 'cookie-consent.view');
            PlatformResponse::json(['data' => ProviderPresets::all()]);
        }, $protected);
    }
}
