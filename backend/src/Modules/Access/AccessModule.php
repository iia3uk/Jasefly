<?php
declare(strict_types=1);

namespace App\Modules\Access;

use App\Controllers\AccessAdminController;
use App\Core\AbstractModule;
use App\Database;
use App\Jwt;
use App\Middleware\AuthMiddleware;
use App\Middleware\PermissionMiddleware;
use App\Platform\Access\AccessHost;
use App\Platform\Access\AccessRule;
use App\Platform\Access\Providers\PurchaseAccessProvider;
use App\Request;
use App\Response;
use App\Router;
use App\Services\PermissionService;
use App\Support\AuthCookie;

/** Host Access Control HTTP surface + purchase provider registration. */
final class AccessModule extends AbstractModule
{
    public function name(): string
    {
        return 'access';
    }

    public function label(): string
    {
        return 'Контроль доступа';
    }

    public function description(): string
    {
        return 'Кто видит блоки на сайте: вход, роль, покупка, подписка, группа, кошелёк.';
    }

    public function longDescription(): string
    {
        return "Универсальный контроль доступа для билдера и публичных страниц.\n\n"
            . "Как пользоваться:\n"
            . "1. Билдер → вкладка «Виджеты» → найдите «Доступ».\n"
            . "2. Добавьте контейнер на страницу и положите внутрь закрытый контент.\n"
            . "3. В инспекторе задайте правило (вход / роль / покупка / …) и режим отказа.\n\n"
            . "Важно: сервер не отдаёт закрытый контент гостю — paywall нельзя обойти через DevTools.\n"
            . "Билдер не ходит в Billing: только AccessService и провайдеры.\n\n"
            . "Встроенные проверки: auth, role, purchase.\n"
            . "ZIP-расширения: user-groups, subscriptions, wallet.";
    }

    public function category(): string
    {
        return 'security';
    }

    public function priority(): int
    {
        return 15;
    }

    public function settingsSchema(): array
    {
        return [
            [
                'key' => 'howto',
                'label' => 'Как пользоваться',
                'type' => 'heading',
                'help' => 'Виджет «Доступ» в билдере оборачивает контент. Правило и режим отказа настраиваются в инспекторе блока — не здесь.',
            ],
            [
                'key' => 'guide_step',
                'label' => 'Кратко',
                'type' => 'select',
                'default' => 'builder',
                'options' => [
                    ['value' => 'builder', 'label' => '1) Билдер → Виджеты → «Доступ»'],
                    ['value' => 'nest', 'label' => '2) Внутрь — закрытый контент'],
                    ['value' => 'rule', 'label' => '3) Инспектор → правило + режим отказа'],
                ],
                'help' => 'Справочное поле: сохранять не обязательно. Полная инструкция — в «О плагине».',
            ],
            [
                'key' => 'providers_hint',
                'label' => 'Провайдеры',
                'type' => 'heading',
                'help' => 'auth / role / purchase — в ядре. Группы, подписки и кошелёк — ZIP-модули (Module Manager), они регистрируют свои проверки в AccessService.',
            ],
            [
                'key' => 'fail_closed',
                'label' => 'Неизвестный провайдер = отказ',
                'type' => 'toggle',
                'default' => true,
                'help' => 'Всегда включено на сервере (fail-closed). Переключатель только для напоминания: отключить нельзя.',
            ],
        ];
    }

    public function settings(): array
    {
        return [
            'guide_step' => 'builder',
            'fail_closed' => true,
        ];
    }

    public function boot(Database $db, array $app): void
    {
        $access = AccessHost::boot($db);
        foreach ($access->providers() as $p) {
            if (($p['id'] ?? '') === 'purchase') {
                return;
            }
        }
        $access->registerProvider(new PurchaseAccessProvider($db));
    }

    public function registerRoutes(Router $router, Database $db, array $app, string $apiPrefix): void
    {
        $p = fn(string $path): string => rtrim($apiPrefix, '/') . $path;
        $access = AccessHost::boot($db);
        $admin = new AccessAdminController($db, $app);
        $protected = [new AuthMiddleware($app['jwt_secret']), new PermissionMiddleware(new PermissionService($db))];

        $router->get($p('/access/providers'), static function () use ($access) {
            Response::json(['data' => $access->providers()]);
        });

        $router->post($p('/access/can'), static function (Request $r) use ($access, $app) {
            $userId = self::optionalUserId($r, $app);
            $rule = $r->input('rule');
            if (is_string($rule)) {
                $decoded = json_decode($rule, true);
                $rule = is_array($decoded) ? $decoded : null;
            }
            if (!is_array($rule)) {
                $rule = is_array($r->input('access') ?? null) ? $r->input('access') : null;
            }
            $decision = $access->can($userId, is_array($rule) ? $rule : null);
            Response::json([
                'data' => [
                    ...$decision->toArray(),
                    'rule' => AccessRule::normalize($rule),
                    'user_id' => $userId,
                ],
            ]);
        });

        $router->get($p('/admin/access/bootstrap'), [$admin, 'bootstrap'], $protected);
        $router->post($p('/admin/access/batch-can'), [$admin, 'batchCan'], $protected);
        $router->get($p('/admin/access/users/{id}/effective'), fn(Request $r, $id) => $admin->effective($r, (string) $id), $protected);
        $router->get($p('/admin/access/users/{id}/overrides'), fn(Request $r, $id) => $admin->getOverrides($r, (string) $id), $protected);
        $router->put($p('/admin/access/users/{id}/overrides'), fn(Request $r, $id) => $admin->putOverrides($r, (string) $id), $protected);
        $router->put($p('/admin/access/users/{id}/roles'), fn(Request $r, $id) => $admin->putUserRoles($r, (string) $id), $protected);
    }

    /** @param array<string, mixed> $app */
    public static function optionalUserId(Request $r, array $app): ?int
    {
        if (isset($r->user['sub'])) {
            $id = (int) $r->user['sub'];
            return $id > 0 ? $id : null;
        }
        $token = $r->bearer() ?: AuthCookie::token();
        if (!$token) {
            return null;
        }
        try {
            $payload = Jwt::decode($token, (string) ($app['jwt_secret'] ?? ''));
            if (($payload['type'] ?? '') !== 'access') {
                return null;
            }
            $id = (int) ($payload['sub'] ?? 0);
            return $id > 0 ? $id : null;
        } catch (\Throwable) {
            return null;
        }
    }
}
