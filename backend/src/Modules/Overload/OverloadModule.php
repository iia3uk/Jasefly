<?php
declare(strict_types=1);

namespace App\Modules\Overload;

use App\Core\AbstractModule;
use App\Core\Container;
use App\Core\ModuleRegistry;
use App\Database;
use App\Middleware\AuthMiddleware;
use App\Middleware\PermissionMiddleware;
use App\Request;
use App\Response;
use App\Router;
use App\Services\PermissionService;

/**
 * Built-in overload protection: monitor load average, optional 503 + email alerts.
 */
final class OverloadModule extends AbstractModule
{
    public function name(): string
    {
        return 'overload';
    }

    public function label(): string
    {
        return 'Защита от перегрузок';
    }

    public function priority(): int
    {
        return 14;
    }

    public function settingsSchema(): array
    {
        return [
            ['key' => '_h1', 'label' => 'Пороги нагрузки', 'type' => 'heading',
                'help' => 'sys_getloadavg на shared — нагрузка всего хоста (соседи). По умолчанию порог × число CPU. Windows / часть хостингов — fail-open.'],
            ['key' => 'normalize_by_cpu', 'label' => 'Порог на одно CPU-ядро', 'type' => 'checkbox', 'default' => true,
                'help' => 'Вкл: порог 2.5 при 16 ядрах = абсолютный 40. Выкл: сравнивать сырой load с числом как есть.'],
            ['key' => 'threshold_1m', 'label' => 'Порог load 1m', 'type' => 'number', 'default' => 2.5,
                'help' => 'При «на ядро» — единицы на CPU (обычно 1.5–3). При абсолютном режиме — сырой load (на shared часто 20–60 и это норма).'],
            ['key' => 'threshold_5m', 'label' => 'Порог load 5m (0 = авто при «устойчивой»)', 'type' => 'number', 'default' => 0],
            ['key' => 'require_sustained', 'label' => 'Только устойчивая перегрузка (1m + 5m)', 'type' => 'checkbox', 'default' => true,
                'help' => 'Короткие всплески (ZIP MCP-апдейта) не пишутся в журнал, если 5m ещё низкий.'],
            ['key' => 'mode', 'label' => 'Режим при превышении', 'type' => 'select', 'default' => 'log',
                'options' => [
                    ['value' => 'log', 'label' => 'Только зафиксировать (без действий)'],
                    ['value' => 'notify', 'label' => 'Только уведомить по email'],
                    ['value' => 'block', 'label' => 'Только закрыть сайт (503)'],
                    ['value' => 'block_notify', 'label' => 'Закрыть сайт (503) + email'],
                ],
                'help' => 'По умолчанию только журнал — включите 503/email после подбора порога.'],
            ['key' => 'retry_after', 'label' => 'Retry-After (сек)', 'type' => 'number', 'default' => 30],
            ['key' => 'error_message', 'label' => 'Текст ошибки 503', 'type' => 'textarea', 'default' =>
                'Сайт временно недоступен из‑за высокой нагрузки на сервер. Попробуйте позже.'],
            ['key' => '_h2', 'label' => 'Уведомления и окна', 'type' => 'heading'],
            ['key' => 'notify_emails', 'label' => 'Email (несколько через запятую)', 'type' => 'text', 'default' => '',
                'help' => 'Пусто — взять to_email из плагина «Почта».'],
            ['key' => 'notify_cooldown_min', 'label' => 'Пауза между письмами (мин)', 'type' => 'number', 'default' => 15],
            ['key' => 'quiet_after_update_sec', 'label' => 'Тишина после ZIP-апдейта (сек)', 'type' => 'number', 'default' => 600,
                'help' => 'После MCP/панельного обновления не логировать и не закрывать сайт (по умолчанию 10 мин).'],
            ['key' => 'admin_bypass', 'label' => 'Не блокировать админ API с токеном', 'type' => 'checkbox', 'default' => true],
            ['key' => 'sample_ttl_sec', 'label' => 'Кэш замера load (сек)', 'type' => 'number', 'default' => 5],
            ['key' => 'event_cooldown_sec', 'label' => 'Пауза между записями в журнал (сек)', 'type' => 'number', 'default' => 300],
        ];
    }

    public function settings(): array
    {
        return OverloadService::defaultSettings();
    }

    public function globalMiddleware(Database $db, array $app): array
    {
        $storage = (string) ($app['storage'] ?? dirname(__DIR__, 3) . '/storage');
        $svc = new OverloadService($db, $this->resolvedSettings(), $storage, $app);
        return [new OverloadGuardMiddleware($svc)];
    }

    public function registerRoutes(Router $router, Database $db, array $app, string $apiPrefix): void
    {
        $p = fn(string $path) => rtrim($apiPrefix, '/') . $path;
        $protected = [new AuthMiddleware($app['jwt_secret']), new PermissionMiddleware(new PermissionService($db))];
        $storage = (string) ($app['storage'] ?? dirname(__DIR__, 3) . '/storage');

        $svc = fn(): OverloadService => new OverloadService($db, $this->resolvedSettings(), $storage, $app);

        $router->get($p('/admin/overload/status'), function () use ($svc) {
            Response::json(['success' => true, 'data' => $svc()->publicStatus()]);
        }, $protected);

        $router->post($p('/admin/overload/test-notify'), function () use ($svc) {
            Response::json(['success' => true, 'data' => $svc()->sendTestNotify()]);
        }, $protected);

        $router->post($p('/admin/overload/clear-events'), function (Request $r) use ($db) {
            try {
                $db->run('DELETE FROM overload_events');
            } catch (\Throwable $e) {
                Response::error($e->getMessage(), 500);
            }
            Response::json(['success' => true, 'data' => ['cleared' => true]]);
        }, $protected);
    }

    public function adminNav(): array
    {
        return [
            [
                'group' => 'Система',
                'path' => '/admin/overload',
                'label' => 'Перегрузки',
                'permission' => 'system.manage',
                'icon' => 'activity',
            ],
        ];
    }

    /** @return array<string, mixed> */
    private function resolvedSettings(): array
    {
        try {
            /** @var ModuleRegistry $registry */
            $registry = Container::getInstance()->get(ModuleRegistry::class);
            return array_merge(OverloadService::defaultSettings(), $registry->state()->getSettings($this));
        } catch (\Throwable) {
            return $this->settings();
        }
    }
}
