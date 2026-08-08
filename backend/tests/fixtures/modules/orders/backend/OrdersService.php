<?php
declare(strict_types=1);

namespace App\PackageModules\Orders;

use App\Platform\Contracts\PlatformDatabaseInterface;
use App\Platform\Contracts\PlatformEventsInterface;
use App\Platform\Contracts\PlatformCatalogInterface;

final class OrdersService
{
    private const STATUSES = ['new', 'pending', 'paid', 'processing', 'shipped', 'completed', 'cancelled', 'refunded'];

    public function __construct(
        private PlatformDatabaseInterface $db,
        private PlatformEventsInterface $events,
        private PlatformCatalogInterface $catalog,
    ) {
        
    }

    public function publicId(): string
    {
        return strtolower(bin2hex(random_bytes(13)));
    }

    /** @param list<array<string,mixed>> $items @return array<string,float> */
    public function calculateTotals(array $items, float $discount = 0, float $tax = 0, float $shipping = 0): array
    {
        $subtotal = 0.0;
        foreach ($items as $item) {
            $quantity = max(1, (int) ($item['quantity'] ?? $item['qty'] ?? 1));
            $unitPrice = max(0, round((float) ($item['unit_price'] ?? $item['price'] ?? 0), 2));
            $subtotal += $quantity * $unitPrice;
        }
        $subtotal = round($subtotal, 2);
        $discount = min($subtotal, max(0, round($discount, 2)));
        $tax = max(0, round($tax, 2));
        $shipping = max(0, round($shipping, 2));
        return [
            'subtotal' => $subtotal,
            'discount_total' => $discount,
            'tax_total' => $tax,
            'shipping_total' => $shipping,
            'grand_total' => round($subtotal - $discount + $tax + $shipping, 2),
        ];
    }

    /**
     * Adapter used by Payments and public checkout. Prices supplied by Payments
     * are already catalog-resolved; public carts are re-resolved in cartItems().
     * @param array<string,mixed> $input
     * @return array<string,mixed>
     */
    public function createOrderFromCheckout(array $input): array
    {
        $items = is_array($input['items'] ?? null) ? array_values($input['items']) : [];
        if ($items === []) {
            throw new \InvalidArgumentException('Order items are required');
        }
        $totals = $this->calculateTotals(
            $items,
            (float) ($input['discount_total'] ?? 0),
            (float) ($input['tax_total'] ?? 0),
            (float) ($input['shipping_total'] ?? 0),
        );
        if ($totals['grand_total'] <= 0) {
            throw new \InvalidArgumentException('Order total must be positive');
        }

        $id = (int) ($input['order_id'] ?? 0);
        $publicId = (string) ($input['public_id'] ?? $this->publicId());
        $number = (string) ($input['number'] ?? ('ORD-' . strtoupper(bin2hex(random_bytes(4))) . '-' . date('ymd')));
        $email = trim((string) ($input['email'] ?? $input['customer_email'] ?? ''));
        $name = trim((string) ($input['name'] ?? $input['customer_name'] ?? ''));
        $currency = strtoupper(substr((string) ($input['currency'] ?? 'RUB'), 0, 8));
        $status = (string) ($input['status'] ?? 'new');
        if (!in_array($status, self::STATUSES, true)) {
            $status = 'new';
        }
        $metadata = json_encode($input['metadata'] ?? new \stdClass(), JSON_UNESCAPED_UNICODE);
        $legacyItems = json_encode($items, JSON_UNESCAPED_UNICODE);

        if ($id > 0 && $this->db->one('SELECT id FROM orders WHERE id=?', [$id])) {
            $this->db->run(
                'UPDATE orders SET customer_email=?, customer_name=?, email=?, amount=?, grand_total=?, subtotal=?,
                 discount_total=?, tax_total=?, shipping_total=?, currency=?, status=?, items=?, metadata=?, note=COALESCE(?,note) WHERE id=?',
                [$email ?: null, $name ?: null, $email ?: null, $totals['grand_total'], $totals['grand_total'],
                    $totals['subtotal'], $totals['discount_total'], $totals['tax_total'], $totals['shipping_total'],
                    $currency, $status, $legacyItems, $metadata, $input['note'] ?? null, $id]
            );
            $this->db->run('DELETE FROM order_items WHERE order_id=?', [$id]);
        } else {
            $this->db->run(
                'INSERT INTO orders (public_id, number, user_id, customer_email, customer_name, email, amount, currency,
                 status, items, subtotal, discount_total, tax_total, shipping_total, grand_total, payment_status,
                 fulfillment_status, source, metadata, note)
                 VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
                [$publicId, $number, $input['user_id'] ?? null, $email ?: null, $name ?: null, $email ?: null,
                    $totals['grand_total'], $currency, $status, $legacyItems, $totals['subtotal'],
                    $totals['discount_total'], $totals['tax_total'], $totals['shipping_total'], $totals['grand_total'],
                    $input['payment_status'] ?? 'unpaid', $input['fulfillment_status'] ?? 'unfulfilled',
                    $input['source'] ?? 'checkout', $metadata, $input['note'] ?? null]
            );
            $id = (int) $this->db->lastInsertId();
            $this->db->run(
                'INSERT INTO order_status_history (order_id, from_status, to_status, actor_id, note) VALUES (?,NULL,?,?,?)',
                [$id, $status, $input['actor_id'] ?? null, 'Order created']
            );
        }

        foreach ($items as $item) {
            $quantity = max(1, (int) ($item['quantity'] ?? $item['qty'] ?? 1));
            $unitPrice = max(0, round((float) ($item['unit_price'] ?? $item['price'] ?? 0), 2));
            $this->db->run(
                'INSERT INTO order_items (order_id, product_id, sku, title, quantity, unit_price, total, metadata)
                 VALUES (?,?,?,?,?,?,?,?)',
                [$id, $item['product_id'] ?? (($item['type'] ?? null) === 'product' ? ($item['id'] ?? null) : null), $item['sku'] ?? null,
                    (string) ($item['title'] ?? 'Item'), $quantity, $unitPrice, round($quantity * $unitPrice, 2),
                    json_encode($item['metadata'] ?? new \stdClass(), JSON_UNESCAPED_UNICODE)]
            );
        }
        $order = $this->get($id) ?? ['id' => $id, 'number' => $number, 'public_id' => $publicId];
        $this->dispatch('order.created', ['order_id' => $id, 'public_id' => $order['public_id'] ?? $publicId, 'total' => $totals['grand_total']]);
        return $order;
    }

    /** @return array<string,mixed>|null */
    public function get(int $id): ?array
    {
        $order = $this->db->one('SELECT * FROM orders WHERE id=?', [$id]);
        if (!$order) {
            return null;
        }
        $order['order_items'] = $this->db->all('SELECT * FROM order_items WHERE order_id=? ORDER BY id', [$id]);
        $order['addresses'] = $this->db->all('SELECT * FROM order_addresses WHERE order_id=? ORDER BY id', [$id]);
        $order['history'] = $this->db->all('SELECT * FROM order_status_history WHERE order_id=? ORDER BY id DESC', [$id]);
        $order['notes'] = $this->db->all('SELECT * FROM order_notes WHERE order_id=? ORDER BY id DESC', [$id]);
        $order['refunds'] = $this->db->all('SELECT * FROM refunds WHERE order_id=? ORDER BY id DESC', [$id]);
        return $order;
    }

    /** @return array<string,mixed> */
    public function getCart(?string $publicId = null, ?int $userId = null): array
    {
        $cart = null;
        if ($publicId) {
            $cart = $this->db->one("SELECT * FROM carts WHERE public_id=? AND status='active'", [$publicId]);
        } elseif ($userId) {
            $cart = $this->db->one("SELECT * FROM carts WHERE user_id=? AND status='active' ORDER BY id DESC LIMIT 1", [$userId]);
        }
        if (!$cart) {
            $publicId = $this->publicId();
            $this->db->run("INSERT INTO carts (public_id,user_id,status,expires_at) VALUES (?,?,'active',DATE_ADD(NOW(),INTERVAL 30 DAY))", [$publicId, $userId]);
            $cart = $this->db->one('SELECT * FROM carts WHERE id=?', [(int) $this->db->lastInsertId()]);
        }
        $cart['items'] = $this->cartItems((int) $cart['id']);
        $cart['totals'] = $this->calculateTotals($cart['items']);
        return $cart;
    }

    /** @return array<string,mixed> */
    public function addCartItem(string $publicId, int $productId, int $quantity = 1): array
    {
        $cart = $this->getCart($publicId ?: null);
        $product = $this->catalog->findProductById($productId);
        if (!$product) {
            throw new \InvalidArgumentException('Product not found');
        }
        $existing = $this->db->one('SELECT id,quantity FROM cart_items WHERE cart_id=? AND product_id=?', [(int) $cart['id'], $productId]);
        if ($existing) {
            $this->db->run('UPDATE cart_items SET quantity=? WHERE id=?', [max(1, (int) $existing['quantity'] + $quantity), (int) $existing['id']]);
        } else {
            $this->db->run(
                'INSERT INTO cart_items (cart_id,product_id,sku,title,quantity,unit_price) VALUES (?,?,?,?,?,?)',
                [(int) $cart['id'], $productId, $product['sku'], $product['title'], max(1, $quantity), $product['price']]
            );
        }
        $result = $this->getCart((string) $cart['public_id']);
        $this->dispatch('cart.updated', ['cart_public_id' => $cart['public_id'], 'items_count' => count($result['items'])]);
        return $result;
    }

    /** @return array<string,mixed> */
    public function updateCartItem(string $publicId, int $itemId, int $quantity): array
    {
        $cart = $this->getCart($publicId);
        if ($quantity <= 0) {
            $this->db->run('DELETE FROM cart_items WHERE id=? AND cart_id=?', [$itemId, (int) $cart['id']]);
        } else {
            $this->db->run('UPDATE cart_items SET quantity=? WHERE id=? AND cart_id=?', [min(999, $quantity), $itemId, (int) $cart['id']]);
        }
        $result = $this->getCart($publicId);
        $this->dispatch('cart.updated', ['cart_public_id' => $publicId, 'items_count' => count($result['items'])]);
        return $result;
    }

    /** @return list<array<string,mixed>> */
    private function cartItems(int $cartId): array
    {
        $items = $this->db->all('SELECT * FROM cart_items WHERE cart_id=? ORDER BY id', [$cartId]);
        foreach ($items as &$item) {
            if ($item['product_id'] !== null && ($product = $this->catalog->findProductById((int) $item['product_id'])) !== null) {
                $item['unit_price'] = $product['price'];
                $item['title'] = $product['title'];
                $item['sku'] = $product['sku'];
                $this->db->run('UPDATE cart_items SET unit_price=?,title=?,sku=? WHERE id=?', [$item['unit_price'], $item['title'], $item['sku'], $item['id']]);
            }
        }
        unset($item);
        return $items;
    }

    public function transitionStatus(int $orderId, string $to, ?int $actorId = null, ?string $note = null): array
    {
        $order = $this->get($orderId);
        if (!$order) {
            throw new \InvalidArgumentException('Order not found');
        }
        if (!in_array($to, self::STATUSES, true)) {
            throw new \InvalidArgumentException('Invalid order status');
        }
        $from = (string) $order['status'];
        if ($from === $to) {
            return $order;
        }
        $allowed = [
            'new' => ['pending', 'paid', 'cancelled'],
            'pending' => ['paid', 'cancelled'],
            'paid' => ['processing', 'shipped', 'completed', 'cancelled', 'refunded'],
            'processing' => ['shipped', 'completed', 'cancelled', 'refunded'],
            'shipped' => ['completed', 'refunded'],
            'completed' => ['refunded'],
            'cancelled' => [],
            'refunded' => [],
        ];
        if (!in_array($to, $allowed[$from] ?? [], true)) {
            throw new \InvalidArgumentException("Transition {$from} → {$to} is not allowed");
        }
        $payment = in_array($to, ['paid', 'processing', 'shipped', 'completed'], true) ? 'paid' : ($to === 'refunded' ? 'refunded' : ($order['payment_status'] ?? 'unpaid'));
        $fulfillment = $to === 'completed' ? 'fulfilled' : ($to === 'shipped' ? 'shipped' : ($order['fulfillment_status'] ?? 'unfulfilled'));
        $this->db->run('UPDATE orders SET status=?,payment_status=?,fulfillment_status=?,amount=grand_total WHERE id=?', [$to, $payment, $fulfillment, $orderId]);
        $this->db->run('INSERT INTO order_status_history (order_id,from_status,to_status,actor_id,note) VALUES (?,?,?,?,?)', [$orderId, $from, $to, $actorId, $note]);
        $payload = ['order_id' => $orderId, 'from' => $from, 'to' => $to];
        $this->dispatch('order.status_changed', $payload);
        if ($to === 'paid') {
            $this->dispatch('order.paid', $payload);
        }
        if (in_array($to, ['completed', 'cancelled'], true)) {
            $this->dispatch('order.' . $to, $payload);
        }
        return $this->get($orderId) ?? [];
    }

    public function addNote(int $orderId, string $body, ?int $authorId = null, bool $visible = false): array
    {
        if (trim($body) === '') {
            throw new \InvalidArgumentException('Note is required');
        }
        $this->db->run('INSERT INTO order_notes (order_id,author_id,body,is_customer_visible) VALUES (?,?,?,?)', [$orderId, $authorId, trim($body), $visible ? 1 : 0]);
        return $this->db->one('SELECT * FROM order_notes WHERE id=?', [(int) $this->db->lastInsertId()]) ?? [];
    }

    public function recordRefund(int $orderId, float $amount, ?int $paymentId, ?string $reason, ?int $actorId): array
    {
        $order = $this->get($orderId);
        if (!$order || $amount <= 0 || $amount > (float) $order['grand_total']) {
            throw new \InvalidArgumentException('Invalid refund amount');
        }
        $publicId = $this->publicId();
        $this->db->run(
            'INSERT INTO refunds (public_id,order_id,payment_id,amount,currency,status,reason,created_by) VALUES (?,?,?,?,?,"recorded",?,?)',
            [$publicId, $orderId, $paymentId, round($amount, 2), $order['currency'], $reason, $actorId]
        );
        $refunded = $this->db->one('SELECT COALESCE(SUM(amount),0) total FROM refunds WHERE order_id=?', [$orderId]);
        if ((float) ($refunded['total'] ?? 0) >= (float) $order['grand_total']) {
            $this->transitionStatus($orderId, 'refunded', $actorId, $reason);
        }
        $refund = $this->db->one('SELECT * FROM refunds WHERE public_id=?', [$publicId]) ?? [];
        $this->dispatch('order.refunded', ['order_id' => $orderId, 'refund' => $refund]);
        return $refund;
    }

    private function dispatch(string $name, array $payload): void
    {
        $this->events->publish($name, $payload);
    }
}
