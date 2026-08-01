<?php
declare(strict_types=1);

namespace App\Platform\Access\Providers;

use App\Database;
use App\Platform\Access\AccessDecision;
use App\Platform\Access\AccessProviderInterface;

/** Entitlement via paid orders — registered by Orders/Payments host modules. */
final class PurchaseAccessProvider implements AccessProviderInterface
{
    public function __construct(private Database $db) {}

    public function id(): string
    {
        return 'purchase';
    }

    public function label(): string
    {
        return 'Покупка';
    }

    public function asserts(): array
    {
        return [
            [
                'id' => 'owns',
                'label' => 'Купленный товар',
                'params' => [
                    ['key' => 'product_id', 'label' => 'ID товара', 'type' => 'number'],
                    ['key' => 'service_id', 'label' => 'ID услуги (опц.)', 'type' => 'number'],
                ],
            ],
        ];
    }

    public function isAvailable(): bool
    {
        try {
            $this->db->one('SELECT 1 FROM orders LIMIT 1');
            return true;
        } catch (\Throwable) {
            return false;
        }
    }

    public function evaluate(?int $userId, string $assert, array $params = []): AccessDecision
    {
        if ($assert !== 'owns') {
            return AccessDecision::deny('Unknown purchase assert: ' . $assert, $this->id());
        }
        if ($userId === null || $userId <= 0) {
            return AccessDecision::deny('Authentication required', $this->id());
        }
        $productId = (int) ($params['product_id'] ?? 0);
        $serviceId = (int) ($params['service_id'] ?? 0);
        if ($productId <= 0 && $serviceId <= 0) {
            return AccessDecision::deny('product_id or service_id required', $this->id());
        }
        try {
            $email = '';
            $user = $this->db->one('SELECT email FROM users WHERE id=? LIMIT 1', [$userId]);
            if ($user) {
                $email = trim((string) ($user['email'] ?? ''));
            }
            if ($productId > 0 && $this->ownsProduct($userId, $email, $productId)) {
                return AccessDecision::allow($this->id(), ['product_id' => $productId]);
            }
            if ($serviceId > 0 && $this->ownsService($userId, $email, $serviceId)) {
                return AccessDecision::allow($this->id(), ['service_id' => $serviceId]);
            }
            return AccessDecision::deny('Purchase not found', $this->id());
        } catch (\Throwable $e) {
            return AccessDecision::deny('Purchase check failed', $this->id(), ['error' => $e->getMessage()]);
        }
    }

    private function ownsProduct(int $userId, string $email, int $productId): bool
    {
        $sql = "SELECT oi.id FROM order_items oi
            INNER JOIN orders o ON o.id = oi.order_id
            WHERE oi.product_id = ?
              AND o.payment_status = 'paid'
              AND (o.user_id = ?" . ($email !== '' ? ' OR o.email = ? OR o.customer_email = ?' : '') . ')
            LIMIT 1';
        $params = [$productId, $userId];
        if ($email !== '') {
            $params[] = $email;
            $params[] = $email;
        }
        return (bool) $this->db->one($sql, $params);
    }

    private function ownsService(int $userId, string $email, int $serviceId): bool
    {
        // Legacy path: service id stored in order_items metadata or sku pattern
        $sql = "SELECT oi.id FROM order_items oi
            INNER JOIN orders o ON o.id = oi.order_id
            WHERE o.payment_status = 'paid'
              AND (o.user_id = ?" . ($email !== '' ? ' OR o.email = ? OR o.customer_email = ?' : '') . ")
              AND (
                oi.sku = ? OR oi.sku = ?
                OR oi.metadata LIKE ? OR oi.metadata LIKE ?
              )
            LIMIT 1";
        $params = [$userId];
        if ($email !== '') {
            $params[] = $email;
            $params[] = $email;
        }
        $params[] = 'service:' . $serviceId;
        $params[] = (string) $serviceId;
        $params[] = '%"service_id":' . $serviceId . '%';
        $params[] = '%"id":' . $serviceId . '%"type":"service"%';
        return (bool) $this->db->one($sql, $params);
    }
}
