<?php
declare(strict_types=1);

namespace App\Modules\Products;

use App\Controllers\AdminController;
use App\Core\AbstractModule;
use App\Core\Container;
use App\Core\ModuleRegistry;
use App\Core\Services\PageSeedService;
use App\Database;
use App\Middleware\AuthMiddleware;
use App\Middleware\PermissionMiddleware;
use App\Request;
use App\Response;
use App\Router;
use App\Services\PermissionService;
use App\Services\SoftDeleteService;

/**
 * Products catalog plugin — purchasable SKUs for Payments checkout.
 */
final class ProductsModule extends AbstractModule
{
    public function name(): string
    {
        return 'products';
    }

    public function label(): string
    {
        return 'Products';
    }

    public function priority(): int
    {
        return 66;
    }

    public function settingsSchema(): array
    {
        $options = [];
        foreach (ProductTemplates::catalog() as $t) {
            $options[] = ['value' => $t['id'], 'label' => $t['title']];
        }
        return [
            ['key' => '_heading_storefront', 'label' => 'Витрина товара', 'type' => 'heading', 'default' => '',
                'help' => 'Выбор шаблона удобнее на экране «Шаблоны витрины» в меню Коммерция.'],
            ['key' => 'storefront_template', 'label' => 'Шаблон страницы товара', 'type' => 'select',
                'default' => ProductTemplates::defaultId(), 'options' => $options,
                'help' => 'Определяет layout /products/{slug} и набор полей в карточке товара.'],
        ];
    }

    public function settings(): array
    {
        return [
            'storefront_template' => ProductTemplates::defaultId(),
        ];
    }

    public function registerRoutes(Router $router, Database $db, array $app, string $apiPrefix): void
    {
        $p = fn(string $path) => rtrim($apiPrefix, '/') . $path;
        $admin = new AdminController($db, $app);
        $protected = [new AuthMiddleware($app['jwt_secret']), new PermissionMiddleware(new PermissionService($db))];

        $base = $p('/admin/products');
        $router->get($base, fn(Request $r) => $admin->index($r, 'products'), $protected);
        $router->post($base, fn(Request $r) => $admin->create($r, 'products'), $protected);
        $router->get("$base/{id}", fn(Request $r, $id) => $admin->show($r, 'products', $id), $protected);
        $router->put("$base/{id}", fn(Request $r, $id) => $admin->update($r, 'products', $id), $protected);
        $router->delete("$base/{id}", fn(Request $r, $id) => $admin->delete($r, 'products', $id), $protected);

        $router->get($p('/admin/products-meta/templates'), function () use ($db) {
            Response::json(['data' => $this->templatesPayload($db)]);
        }, $protected);

        $router->put($p('/admin/products-meta/templates'), function (Request $r) use ($db) {
            $id = trim((string) ($r->input('storefront_template') ?? ''));
            if (!in_array($id, ProductTemplates::ids(), true)) {
                Response::error('Неизвестный шаблон', 422);
            }
            /** @var ModuleRegistry $registry */
            $registry = Container::getInstance()->get(ModuleRegistry::class);
            $module = $registry->get('products');
            if ($module === null) {
                Response::error('Plugin not found', 404);
            }
            $current = $registry->state()->getSettings($module);
            $registry->state()->setSettings($module, array_merge($current, ['storefront_template' => $id]));
            // Убедиться, что страница шаблона есть в CMS.
            (new PageSeedService($db))->ensureEntries(ProductTemplates::demoPages());
            Response::json(['success' => true, 'data' => $this->templatesPayload($db)]);
        }, $protected);

        $router->get($p('/products/config'), function () use ($db) {
            Response::json(['data' => $this->publicConfig($db)]);
        });

        $router->get($p('/products'), function (Request $r) use ($db) {
            $catalog = new ProductCatalog($db);
            $result = $catalog->search([
                'q' => $r->query('q'),
                'min_price' => $r->query('min_price'),
                'max_price' => $r->query('max_price'),
                'brand' => $r->query('brand'),
                'category' => $r->query('category'),
                'tag' => $r->query('tag'),
                'delivery' => $r->query('delivery'),
                'original' => $r->query('original'),
                'sort' => $r->query('sort'),
                'limit' => $r->query('limit') ?? 100,
                'offset' => $r->query('offset') ?? 0,
            ]);
            // Backward compatible: data = items array; extras for catalog widget.
            Response::json([
                'data' => $result['items'],
                'total' => $result['total'],
                'facets' => $result['facets'],
                'meta' => $result['meta'],
            ]);
        });

        $router->get($p('/products/facets'), function () use ($db) {
            $catalog = new ProductCatalog($db);
            $result = $catalog->search(['limit' => 1]);
            Response::json(['data' => $result['facets']]);
        });

        $router->get($p('/products/{slug}'), function (Request $r, string $slug) use ($db) {
            // Avoid clash with static subpaths
            if ($slug === 'config') {
                Response::json(['data' => $this->publicConfig($db)]);
                return;
            }
            if ($slug === 'facets') {
                $catalog = new ProductCatalog($db);
                $result = $catalog->search(['limit' => 1]);
                Response::json(['data' => $result['facets']]);
                return;
            }
            $soft = new SoftDeleteService($db);
            $notDeleted = $soft->notDeletedClause('products');
            $row = $db->one(
                "SELECT * FROM products WHERE slug=? AND is_visible=1 AND $notDeleted",
                [$slug],
            );
            if (!$row) {
                Response::error('Not found', 404);
            }
            Response::json(['data' => $row]);
        });
    }

    /** @return array<string, mixed> */
    private function templatesPayload(Database $db): array
    {
        $settings = $this->resolvedSettings();
        $active = (string) ($settings['storefront_template'] ?? ProductTemplates::defaultId());
        if (!in_array($active, ProductTemplates::ids(), true)) {
            $active = ProductTemplates::defaultId();
        }
        return [
            'active' => $active,
            'page_slug' => ProductTemplates::pageSlug($active),
            'templates' => ProductTemplates::catalog(),
            'form_fields' => ProductTemplates::formFields($active),
            'base_fields' => $this->baseFormFields(),
        ];
    }

    /** @return array<string, mixed> */
    private function publicConfig(Database $db): array
    {
        $settings = $this->resolvedSettings();
        $active = (string) ($settings['storefront_template'] ?? ProductTemplates::defaultId());
        if (!in_array($active, ProductTemplates::ids(), true)) {
            $active = ProductTemplates::defaultId();
        }
        $tpl = ProductTemplates::get($active);
        return [
            'storefront_template' => $active,
            'page_slug' => ProductTemplates::pageSlug($active),
            'title' => $tpl['title'] ?? $active,
            'templates' => array_map(static fn(array $t) => [
                'id' => $t['id'],
                'title' => $t['title'],
                'page_slug' => ProductTemplates::pageSlug((string) $t['id']),
            ], ProductTemplates::catalog()),
        ];
    }

    /** @return array<string, mixed> */
    private function resolvedSettings(): array
    {
        try {
            /** @var ModuleRegistry $registry */
            $registry = Container::getInstance()->get(ModuleRegistry::class);
            $module = $registry->get('products');
            return $module ? $registry->state()->getSettings($module) : $this->settings();
        } catch (\Throwable) {
            return $this->settings();
        }
    }

    /** @return list<array<string, mixed>> */
    private function baseFormFields(): array
    {
        return [
            ['key' => 'title', 'label' => 'Название', 'widget' => 'text', 'column' => 'title', 'required' => true],
            ['key' => 'sku', 'label' => 'Артикул', 'widget' => 'text', 'column' => 'sku'],
            ['key' => 'price', 'label' => 'Цена', 'widget' => 'number', 'column' => 'price', 'required' => true],
            ['key' => 'currency', 'label' => 'Валюта', 'widget' => 'text', 'column' => 'currency'],
            ['key' => 'media_id', 'label' => 'Обложка', 'widget' => 'media', 'column' => 'media_id'],
            ['key' => 'is_purchasable', 'label' => 'Можно купить', 'widget' => 'toggle', 'column' => 'is_purchasable'],
            ['key' => 'is_visible', 'label' => 'Видим', 'widget' => 'toggle', 'column' => 'is_visible'],
            ['key' => 'sort_order', 'label' => 'Порядок', 'widget' => 'number', 'column' => 'sort_order'],
        ];
    }

    public function adminNav(): array
    {
        return [
            ['group' => 'Коммерция', 'path' => '/admin/products', 'label' => 'Товары', 'permission' => 'commerce.manage', 'icon' => 'shopping-cart'],
            ['group' => 'Коммерция', 'path' => '/admin/products-templates', 'label' => 'Шаблоны витрины', 'permission' => 'commerce.manage', 'icon' => 'layout'],
        ];
    }

    public function resources(): array
    {
        return [
            ['key' => 'products', 'table' => 'products', 'soft_delete' => true, 'sluggable' => true],
        ];
    }

    public function blueprints(): array
    {
        // Базовый blueprint — полный набор колонок для CRUD API / миграций.
        // Форма редактирования на фронте фильтрует поля по активному шаблону.
        return [
            [
                'key' => 'products',
                'table' => 'products',
                'label' => 'Товары',
                'soft_delete' => true,
                'slug' => true,
                'group' => 'Коммерция',
                'orderable' => true,
                'icon' => 'shopping-cart',
                'columns' => [
                    'title' => ['type' => 'string', 'widget' => 'text', 'required' => true, 'label' => 'Название'],
                    'sku' => ['type' => 'string', 'widget' => 'text', 'label' => 'Артикул', 'nullable' => true],
                    'short_description' => ['type' => 'text', 'widget' => 'textarea', 'label' => 'Краткое описание'],
                    'description' => ['type' => 'longtext', 'widget' => 'richtext', 'label' => 'Описание'],
                    'price' => ['type' => 'decimal', 'widget' => 'number', 'required' => true, 'default' => 0, 'label' => 'Цена'],
                    'currency' => ['type' => 'string', 'widget' => 'text', 'default' => 'RUB', 'label' => 'Валюта'],
                    'media_id' => ['type' => 'int', 'widget' => 'media', 'label' => 'Обложка', 'nullable' => true],
                    'video_url' => ['type' => 'string', 'widget' => 'url', 'label' => 'URL видео', 'nullable' => true],
                    'badge' => ['type' => 'string', 'widget' => 'text', 'label' => 'Бейдж статуса', 'nullable' => true],
                    'stock' => ['type' => 'int', 'widget' => 'number', 'label' => 'Остаток (пусто = ∞)', 'nullable' => true],
                    'sold_count' => ['type' => 'int', 'widget' => 'number', 'default' => 0, 'label' => 'Продано'],
                    'attrs' => ['type' => 'json', 'widget' => 'json', 'label' => 'Атрибуты (JSON)', 'nullable' => true],
                    'variants' => ['type' => 'json', 'widget' => 'json', 'label' => 'Тарифы (JSON)', 'nullable' => true],
                    'gallery' => ['type' => 'json', 'widget' => 'json', 'label' => 'Галерея media_id', 'nullable' => true],
                    'tabs' => ['type' => 'json', 'widget' => 'json', 'label' => 'Вкладки (JSON)', 'nullable' => true],
                    'tags' => ['type' => 'json', 'widget' => 'json', 'label' => 'Теги (JSON)', 'nullable' => true],
                    'is_purchasable' => ['type' => 'bool', 'widget' => 'toggle', 'default' => true, 'label' => 'Можно купить'],
                    'is_visible' => ['type' => 'bool', 'widget' => 'toggle', 'default' => true, 'label' => 'Видим'],
                    'sort_order' => ['type' => 'int', 'widget' => 'number', 'default' => 0, 'label' => 'Порядок'],
                ],
                'indexes' => [
                    ['name' => 'idx_products_sort', 'columns' => ['sort_order'], 'type' => 'index'],
                ],
                'permissions' => ['commerce.manage'],
            ],
        ];
    }

    public function blocks(): array
    {
        return [
            [
                'type' => 'products-grid',
                'label' => 'Сетка товаров',
                'category' => 'commerce',
                'settings_schema' => [
                    ['key' => 'title', 'label' => 'Заголовок', 'type' => 'text'],
                    ['key' => 'subtitle', 'label' => 'Подзаголовок', 'type' => 'textarea'],
                    ['key' => 'limit', 'label' => 'Лимит', 'type' => 'number'],
                    ['key' => 'columns', 'label' => 'Колонки', 'type' => 'number'],
                ],
            ],
        ];
    }

    public function publicRoutes(): array
    {
        return [
            ['path' => '/products', 'label' => 'Товары'],
            ['path' => '/products/{slug}', 'label' => 'Страница товара'],
        ];
    }

    public function demoPages(): array
    {
        if (class_exists(\App\Modules\System\SystemTemplates::class)) {
            return \App\Modules\System\SystemTemplates::demoPagesForPlugin('products');
        }
        return ProductTemplates::demoPages();
    }
}
