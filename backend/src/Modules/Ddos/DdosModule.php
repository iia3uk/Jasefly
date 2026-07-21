<?php
declare(strict_types=1);

namespace App\Modules\Ddos;

use App\Core\AbstractModule;
use App\Core\Container;
use App\Core\ModuleRegistry;
use App\Database;
use App\Middleware\AuthMiddleware;
use App\Middleware\PermissionMiddleware;
use App\Modules\Ddos\Providers\ProviderCatalog;
use App\Request;
use App\Response;
use App\Router;
use App\Services\PermissionService;

/**
 * DDoS protection plugin — Cloudflare / DDoS-Guard / StormWall / Qrator.
 *
 * Each provider is independently toggleable. The global middleware enforces
 * origin shield (optional), trusts real-IP headers from the active edge, and
 * applies under-attack rate limits + JS challenge on the origin.
 */
final class DdosModule extends AbstractModule
{
    public function name(): string { return 'ddos'; }
    public function label(): string { return 'DDoS Protection'; }
    public function priority(): int { return 15; }

    public function settingsSchema(): array
    {
        return ProviderCatalog::settingsSchema();
    }

    public function settings(): array
    {
        return ProviderCatalog::defaultSettings();
    }

    public function globalMiddleware(Database $db, array $app): array
    {
        $settings = $this->resolvedSettings();
        // Inject cached Cloudflare CIDRs if present.
        $storage = (string) ($app['storage'] ?? dirname(__DIR__, 3) . '/storage');
        $svc = new DdosService($db, $settings, $storage);
        $cached = $svc->cachedCloudflareCidrs();
        if ($cached) {
            $settings['_cloudflare_cidrs_cache'] = $cached;
            $svc = new DdosService($db, $settings, $storage);
        }
        return [new DdosGuardMiddleware($svc)];
    }

    public function registerRoutes(Router $router, Database $db, array $app, string $apiPrefix): void
    {
        $p = fn(string $path) => rtrim($apiPrefix, '/') . $path;
        $protected = [new AuthMiddleware($app['jwt_secret']), new PermissionMiddleware(new PermissionService($db))];
        $storage = (string) ($app['storage'] ?? dirname(__DIR__, 3) . '/storage');

        $svc = fn(): DdosService => new DdosService($db, $this->resolvedSettings(), $storage);

        $router->get($p('/admin/ddos/status'), function () use ($svc) {
            Response::json(['success' => true, 'data' => $svc()->publicStatus()]);
        }, $protected);

        $router->post($p('/admin/ddos/under-attack'), function (Request $r) use ($svc, $db) {
            $enabled = (bool) ($r->input('enabled') ?? false);
            $syncRemote = (bool) ($r->input('sync_remote') ?? true);
            // Persist local flag into plugin settings.
            $this->persistSetting('under_attack', $enabled);
            $service = new DdosService($db, $this->resolvedSettings(), (string) (Container::getInstance()->get('app')['storage'] ?? ''));
            $remote = $syncRemote ? $service->setUnderAttackAll($enabled) : ['ok' => true, 'results' => []];
            Response::json([
                'success' => true,
                'data' => [
                    'under_attack' => $enabled,
                    'remote' => $remote,
                    'status' => $service->publicStatus(),
                ],
            ]);
        }, $protected);

        $router->post($p('/admin/ddos/providers/{id}/toggle'), function (Request $r, string $id) use ($svc) {
            $provider = ProviderCatalog::get($id);
            if (!$provider) {
                Response::json(['success' => false, 'error' => 'Unknown provider'], 404);
            }
            $enabled = (bool) ($r->input('enabled') ?? false);
            $this->persistSetting('enable_' . $id, $enabled);
            Response::json([
                'success' => true,
                'data' => [
                    'id' => $id,
                    'enabled' => $enabled,
                    'status' => $svc()->publicStatus(),
                ],
            ]);
        }, $protected);

        $router->post($p('/admin/ddos/sync-cloudflare-ips'), function () use ($svc) {
            Response::json(['success' => true, 'data' => $svc()->syncCloudflareRanges()]);
        }, $protected);

        $router->get($p('/admin/ddos/providers'), function () use ($svc) {
            Response::json(['success' => true, 'data' => $svc()->publicStatus()['providers']]);
        }, $protected);
    }

    public function adminNav(): array
    {
        return [
            ['group' => 'Система', 'path' => '/admin/ddos', 'label' => 'DDoS защита', 'permission' => 'system.manage', 'icon' => 'shield'],
        ];
    }

    /** @return array<string, mixed> */
    private function resolvedSettings(): array
    {
        try {
            /** @var ModuleRegistry $registry */
            $registry = Container::getInstance()->get(ModuleRegistry::class);
            return $registry->state()->getSettings($this);
        } catch (\Throwable) {
            return $this->settings();
        }
    }

    private function persistSetting(string $key, mixed $value): void
    {
        /** @var ModuleRegistry $registry */
        $registry = Container::getInstance()->get(ModuleRegistry::class);
        $current = $registry->state()->getSettings($this);
        $current[$key] = $value;
        // Keep default_provider-style sync: also ensure plugin row stays enabled.
        $registry->state()->setSettings($this, $current);
    }
}
