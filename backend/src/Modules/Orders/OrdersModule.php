<?php
declare(strict_types=1);

namespace App\Modules\Orders;

use App\Core\AbstractModule;
use App\Database;
use App\Middleware\AuthMiddleware;
use App\Middleware\PermissionMiddleware;
use App\Middleware\RateLimitMiddleware;
use App\Modules\Forms\CsvExport;
use App\Request;
use App\Response;
use App\Router;
use App\Services\PermissionService;

final class OrdersModule extends AbstractModule
{
    public function name(): string { return 'orders'; }
    public function label(): string { return 'Заказы'; }
    public function priority(): int { return 64; }

    public function adminNav(): array
    {
        return [['group' => 'Коммерция', 'path' => '/admin/orders', 'label' => 'Заказы', 'permission' => 'orders.view', 'icon' => 'shopping-cart']];
    }

    public function registerRoutes(Router $router, Database $db, array $app, string $apiPrefix): void
    {
        $p = fn(string $path): string => rtrim($apiPrefix, '/') . $path;
        $perms = new PermissionService($db);
        $protected = [new AuthMiddleware($app['jwt_secret']), new PermissionMiddleware($perms)];
        $rate = new RateLimitMiddleware($db, 30, 60);
        $svc = new OrdersService($db);

        $router->get($p('/orders/cart'), function (Request $r) use ($svc) {
            $publicId = trim((string) ($r->query('cart_id') ?? ''));
            Response::json(['data' => $svc->getCart($publicId ?: null)]);
        }, [$rate]);
        $router->post($p('/orders/cart/items'), function (Request $r) use ($svc) {
            try {
                $cart = $svc->addCartItem((string) ($r->input('cart_id') ?? ''), (int) ($r->input('product_id') ?? 0), (int) ($r->input('quantity') ?? 1));
                Response::json(['data' => $cart], 201);
            } catch (\InvalidArgumentException $e) {
                Response::error($e->getMessage(), 422);
            }
        }, [$rate]);
        $router->put($p('/orders/cart/items/{id}'), function (Request $r, string $id) use ($svc) {
            Response::json(['data' => $svc->updateCartItem((string) ($r->input('cart_id') ?? ''), (int) $id, (int) ($r->input('quantity') ?? 1))]);
        }, [$rate]);
        $router->post($p('/orders/checkout'), function (Request $r) use ($svc) {
            try {
                $cart = $svc->getCart((string) ($r->input('cart_id') ?? ''));
                if (empty($cart['items'])) {
                    Response::error('Cart is empty', 422);
                }
                $order = $svc->createOrderFromCheckout([
                    'items' => $cart['items'],
                    'email' => $r->input('email'),
                    'name' => $r->input('name'),
                    'currency' => $cart['currency'] ?? 'RUB',
                    'shipping_total' => $r->input('shipping_total') ?? 0,
                    'tax_total' => $r->input('tax_total') ?? 0,
                    'source' => 'cart',
                    'note' => $r->input('note'),
                ]);
                Response::json(['data' => $order], 201);
            } catch (\InvalidArgumentException $e) {
                Response::error($e->getMessage(), 422);
            }
        }, [$rate]);

        $router->get($p('/admin/orders'), function (Request $r) use ($db, $perms) {
            $perms->require($r->user, 'orders.view');
            $status = trim((string) ($r->query('status') ?? ''));
            $query = trim((string) ($r->query('q') ?? ''));
            $sql = 'SELECT id,public_id,number,customer_name,COALESCE(email,customer_email) email,grand_total,amount,currency,status,payment_status,fulfillment_status,created_at FROM orders WHERE 1=1';
            $params = [];
            if ($status !== '') { $sql .= ' AND status=?'; $params[] = $status; }
            if ($query !== '') { $sql .= ' AND (number LIKE ? OR customer_email LIKE ? OR email LIKE ?)'; $like = '%' . $query . '%'; array_push($params, $like, $like, $like); }
            $sql .= ' ORDER BY id DESC LIMIT 300';
            Response::json(['data' => $db->all($sql, $params)]);
        }, $protected);
        $router->get($p('/admin/orders/export'), function (Request $r) use ($db, $perms) {
            $perms->require($r->user, 'orders.export');
            $rows = $db->all('SELECT number,COALESCE(email,customer_email) email,customer_name,status,payment_status,fulfillment_status,grand_total,currency,created_at FROM orders ORDER BY id DESC LIMIT 10000');
            $csvRows = array_map(static fn(array $row): array => array_values($row), $rows);
            header('Content-Type: text/csv; charset=utf-8');
            header('Content-Disposition: attachment; filename="orders-export.csv"');
            echo "\xEF\xBB\xBF" . CsvExport::build(['number','email','customer_name','status','payment_status','fulfillment_status','grand_total','currency','created_at'], $csvRows);
            exit;
        }, $protected);
        $router->get($p('/admin/orders/{id}'), function (Request $r, string $id) use ($svc, $perms) {
            $perms->require($r->user, 'orders.view');
            $order = $svc->get((int) $id);
            if (!$order) { Response::error('Not found', 404); }
            Response::json(['data' => $order]);
        }, $protected);
        $router->post($p('/admin/orders/{id}/status'), function (Request $r, string $id) use ($svc, $perms) {
            $perms->require($r->user, 'orders.manage');
            try {
                Response::json(['data' => $svc->transitionStatus((int) $id, (string) ($r->input('status') ?? ''), (int) ($r->user['sub'] ?? 0), $r->input('note'))]);
            } catch (\InvalidArgumentException $e) { Response::error($e->getMessage(), 422); }
        }, $protected);
        $router->post($p('/admin/orders/{id}/notes'), function (Request $r, string $id) use ($svc, $perms) {
            $perms->require($r->user, 'orders.manage');
            try {
                Response::json(['data' => $svc->addNote((int) $id, (string) ($r->input('body') ?? ''), (int) ($r->user['sub'] ?? 0), (bool) ($r->input('is_customer_visible') ?? false))], 201);
            } catch (\InvalidArgumentException $e) { Response::error($e->getMessage(), 422); }
        }, $protected);
        $router->post($p('/admin/orders/{id}/refunds'), function (Request $r, string $id) use ($svc, $perms) {
            $perms->require($r->user, 'orders.refund');
            try {
                Response::json(['data' => $svc->recordRefund((int) $id, (float) ($r->input('amount') ?? 0), $r->input('payment_id') !== null ? (int) $r->input('payment_id') : null, $r->input('reason'), (int) ($r->user['sub'] ?? 0))], 201);
            } catch (\InvalidArgumentException $e) { Response::error($e->getMessage(), 422); }
        }, $protected);
    }
}
