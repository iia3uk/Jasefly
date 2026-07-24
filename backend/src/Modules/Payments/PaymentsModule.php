<?php
declare(strict_types=1);

namespace App\Modules\Payments;

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
 * Payments plugin — multi-acquiring checkout (RU banks + international gateways).
 *
 * Each provider can be enabled independently in plugin settings. Checkout only
 * runs for enabled+configured providers; webhooks are verified per-provider.
 */
final class PaymentsModule extends AbstractModule
{
    public function name(): string { return 'payments'; }
    public function label(): string { return 'Payments'; }
    public function priority(): int { return 65; }

    public function registerRoutes(Router $router, Database $db, array $app, string $apiPrefix): void
    {
        $p = fn(string $path) => rtrim($apiPrefix, '/') . $path;
        $admin = new \App\Controllers\AdminController($db, $app);
        $protected = [new AuthMiddleware($app['jwt_secret']), new PermissionMiddleware(new PermissionService($db))];
        $webhookRate = new \App\Middleware\RateLimitMiddleware($db, 60, 60);
        $checkoutRate = new \App\Middleware\RateLimitMiddleware($db, 20, 60);

        $resources = ['payments'];
        try {
            $orders = $db->one("SELECT is_enabled FROM modules WHERE name='orders' LIMIT 1");
            if ((int) ($orders['is_enabled'] ?? 0) !== 1) {
                array_unshift($resources, 'orders');
            }
        } catch (\Throwable) {
            array_unshift($resources, 'orders');
        }
        foreach ($resources as $resource) {
            $base = $p("/admin/$resource");
            $router->get($base, fn(Request $r) => $admin->index($r, $resource), $protected);
            $router->post($base, fn(Request $r) => $admin->create($r, $resource), $protected);
            $router->get("$base/{id}", fn(Request $r, $id) => $admin->show($r, $resource, $id), $protected);
            $router->put("$base/{id}", fn(Request $r, $id) => $admin->update($r, $resource, $id), $protected);
            $router->delete("$base/{id}", fn(Request $r, $id) => $admin->delete($r, $resource, $id), $protected);
        }

        $svc = fn(): PaymentService => new PaymentService($db, $this->resolvedSettings(), $apiPrefix);

        $router->get($p('/payments/config'), function () use ($svc) {
            Response::json(['success' => true, 'data' => $svc()->publicConfig()]);
        });

        $router->get($p('/commerce/catalog'), function () use ($db) {
            Response::json(['success' => true, 'data' => (new CommerceCatalog($db))->listPurchasable()]);
        });

        $router->get($p('/commerce/item'), function (Request $r) use ($db) {
            $type = trim((string) ($r->query('type') ?? ''));
            $id = (int) ($r->query('id') ?? 0);
            $item = (new CommerceCatalog($db))->peek($type, $id);
            if (!$item) {
                Response::error('Not found', 404);
            }
            Response::json(['success' => true, 'data' => $item]);
        });

        $router->post($p('/payments/checkout'), function (Request $r) use ($svc) {
            $data = $svc()->checkout($r->all());
            Response::json(['success' => true, 'data' => $data]);
        }, [$checkoutRate]);

        $router->get($p('/payments/status/{id}'), function (Request $r, string $id) use ($svc) {
            $row = $svc()->paymentStatus((int) $id);
            if (!$row) {
                Response::json(['success' => false, 'error' => 'Not found'], 404);
            }
            Response::json(['success' => true, 'data' => $row]);
        });

        $router->post($p('/payments/webhook'), function (Request $r) use ($svc) {
            $ack = $svc()->handleWebhook($r);
            if (is_string($ack)) {
                Response::text($ack);
            }
            if (isset($ack['notificationResponse'])) {
                Response::text((string) $ack['notificationResponse']);
            }
            Response::json($ack);
        }, [$webhookRate]);
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

    public function adminNav(): array
    {
        return [
            ['group' => 'Коммерция', 'path' => '/admin/orders', 'label' => 'Заказы', 'permission' => 'commerce.manage', 'icon' => 'shopping-cart'],
            ['group' => 'Коммерция', 'path' => '/admin/payments', 'label' => 'Платежи', 'permission' => 'commerce.manage', 'icon' => 'credit-card'],
        ];
    }

    public function settingsSchema(): array
    {
        return Providers\ProviderCatalog::settingsSchema();
    }

    public function settings(): array
    {
        return Providers\ProviderCatalog::defaultSettings();
    }

    public function blueprints(): array
    {
        return [
            [
                'key' => 'orders',
                'table' => 'orders',
                'label' => 'Заказы',
                'group' => 'Коммерция',
                'icon' => 'shopping-cart',
                'columns' => [
                    'number' => ['type' => 'string', 'widget' => 'text', 'required' => true, 'label' => 'Номер заказа'],
                    'customer_email' => ['type' => 'string', 'widget' => 'text', 'label' => 'Email клиента'],
                    'customer_name' => ['type' => 'string', 'widget' => 'text', 'label' => 'Имя клиента'],
                    'amount' => ['type' => 'decimal', 'widget' => 'number', 'required' => true, 'label' => 'Сумма'],
                    'currency' => ['type' => 'string', 'widget' => 'text', 'default' => 'RUB', 'label' => 'Валюта'],
                    'status' => ['type' => 'string', 'widget' => 'select', 'default' => 'new', 'label' => 'Статус',
                        'options' => [
                            ['value' => 'new', 'label' => 'Новый'],
                            ['value' => 'paid', 'label' => 'Оплачен'],
                            ['value' => 'shipped', 'label' => 'Отправлен'],
                            ['value' => 'completed', 'label' => 'Завершён'],
                            ['value' => 'cancelled', 'label' => 'Отменён'],
                        ]],
                    'items' => ['type' => 'json', 'widget' => 'json', 'label' => 'Состав заказа'],
                    'item_type' => ['type' => 'string', 'widget' => 'select', 'label' => 'Тип позиции', 'nullable' => true,
                        'options' => [
                            ['value' => 'service', 'label' => 'Услуга'],
                            ['value' => 'product', 'label' => 'Товар'],
                        ]],
                    'item_id' => ['type' => 'int', 'widget' => 'number', 'label' => 'ID позиции', 'nullable' => true],
                    'offer_accepted' => ['type' => 'bool', 'widget' => 'toggle', 'label' => 'Оферта принята', 'default' => false],
                ],
                'permissions' => ['commerce.manage'],
            ],
            [
                'key' => 'payments',
                'table' => 'payments',
                'label' => 'Платежи',
                'group' => 'Коммерция',
                'icon' => 'credit-card',
                'columns' => [
                    'provider' => ['type' => 'string', 'widget' => 'select', 'label' => 'Провайдер',
                        'options' => array_map(
                            static fn(Providers\ProviderInterface $p) => ['value' => $p->id(), 'label' => $p->label()],
                            Providers\ProviderCatalog::all(),
                        )],
                    'external_id' => ['type' => 'string', 'widget' => 'text', 'label' => 'Внешний ID'],
                    'order_id' => ['type' => 'int', 'widget' => 'number', 'label' => 'ID заказа', 'nullable' => true],
                    'amount' => ['type' => 'decimal', 'widget' => 'number', 'required' => true, 'label' => 'Сумма'],
                    'currency' => ['type' => 'string', 'widget' => 'text', 'default' => 'RUB', 'label' => 'Валюта'],
                    'status' => ['type' => 'string', 'widget' => 'select', 'default' => 'pending', 'label' => 'Статус',
                        'options' => [
                            ['value' => 'pending', 'label' => 'Ожидает'],
                            ['value' => 'succeeded', 'label' => 'Успешен'],
                            ['value' => 'failed', 'label' => 'Ошибка'],
                            ['value' => 'refunded', 'label' => 'Возврат'],
                        ]],
                ],
                'permissions' => ['commerce.manage'],
            ],
        ];
    }

    public function blocks(): array
    {
        return [
            [
                'type' => 'payment-checkout',
                'label' => 'Форма оплаты',
                'category' => 'commerce',
                'settings_schema' => [
                    ['key' => 'title', 'label' => 'Заголовок', 'type' => 'text'],
                    ['key' => 'subtitle', 'label' => 'Подзаголовок', 'type' => 'textarea'],
                    ['key' => 'button_label', 'label' => 'Текст кнопки', 'type' => 'text'],
                    ['key' => 'preset_item_type', 'label' => 'Тип позиции (service/product)', 'type' => 'text'],
                    ['key' => 'preset_item_id', 'label' => 'ID услуги/товара', 'type' => 'number'],
                    ['key' => 'show_seller', 'label' => 'Реквизиты продавца', 'type' => 'checkbox'],
                    ['key' => 'show_payment_icons', 'label' => 'Иконки карт', 'type' => 'checkbox'],
                ],
            ],
            [
                'type' => 'payment-methods',
                'label' => 'Иконки оплаты',
                'category' => 'commerce',
                'settings_schema' => [
                    ['key' => 'title', 'label' => 'Подпись', 'type' => 'text'],
                    ['key' => 'icons', 'label' => 'Иконки (mir,visa,…)', 'type' => 'text'],
                ],
            ],
            [
                'type' => 'seller-info',
                'label' => 'Реквизиты продавца',
                'category' => 'commerce',
                'settings_schema' => [
                    ['key' => 'title', 'label' => 'Заголовок', 'type' => 'text'],
                    ['key' => 'show_offer', 'label' => 'Показать оферту', 'type' => 'checkbox'],
                ],
            ],
            [
                'type' => 'offer-document',
                'label' => 'Документ оферты',
                'category' => 'commerce',
                'settings_schema' => [
                    ['key' => 'title', 'label' => 'Заголовок', 'type' => 'text'],
                ],
            ],
        ];
    }

    public function publicRoutes(): array
    {
        return [
            ['path' => '/payment', 'label' => 'Оплата'],
            ['path' => '/payment-success', 'label' => 'Успешная оплата'],
            ['path' => '/payment-fail', 'label' => 'Ошибка оплаты'],
            ['path' => '/offer', 'label' => 'Публичная оферта'],
        ];
    }

    public function demoPages(): array
    {
        // При включении Payments — сразу создать commerce-страницы из SystemTemplates.
        if (!class_exists(\App\Modules\System\SystemTemplates::class)) {
            return [];
        }
        $slugs = ['payment', 'payment-success', 'payment-fail', 'offer'];
        $out = [];
        foreach (\App\Modules\System\SystemTemplates::demoPages() as $page) {
            if (in_array((string) ($page['slug'] ?? ''), $slugs, true)) {
                $out[] = $page;
            }
        }
        return $out;
    }

    /**
     * Minimal builder layout document with a single section/column of widgets.
     *
     * @param list<array{widgetType:string,settings:array<string,mixed>}> $widgets
     * @return array<string, mixed>
     */
    private function pageLayout(array $widgets): array
    {
        $els = [];
        foreach ($widgets as $i => $w) {
            $els[] = [
                'id' => 'w_pay_' . $i,
                'elType' => 'widget',
                'widgetType' => $w['widgetType'],
                'settings' => $w['settings'],
                'elements' => [],
            ];
        }
        return [
            'version' => 1,
            'elements' => [[
                'id' => 'sec_pay',
                'elType' => 'section',
                'settings' => ['paddingY' => '4rem', 'gap' => '1.5rem', 'columns' => 1],
                'elements' => [[
                    'id' => 'col_pay',
                    'elType' => 'column',
                    'settings' => ['width' => 100],
                    'elements' => $els,
                ]],
            ]],
        ];
    }
}
