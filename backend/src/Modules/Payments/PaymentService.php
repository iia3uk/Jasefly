<?php
declare(strict_types=1);

namespace App\Modules\Payments;

use App\Database;
use App\Modules\Payments\Providers\CheckoutRequest;
use App\Modules\Payments\Providers\ProviderCatalog;
use App\Modules\Payments\Providers\ProviderContext;
use App\Request;
use App\Response;

// Ensure grouped provider classes are loaded (not 1:1 PSR-4 files).
require_once __DIR__ . '/Providers/ProviderCatalog.php';

/**
 * Multi-provider checkout orchestrator.
 *
 * Each acquiring method is a separate ProviderInterface implementation that can
 * be enabled independently and only runs when credentials are configured.
 */
final class PaymentService
{
    private ProviderContext $ctx;

    /** @param array<string, mixed> $settings */
    public function __construct(
        private Database $db,
        private array $settings,
        string $apiPrefix = '/api/v1',
    ) {
        $this->ctx = new ProviderContext($db, $settings, $apiPrefix);
    }

    /** @return array<string, mixed> */
    public function publicConfig(): array
    {
        $enabled = [];
        $anyConfigured = false;
        foreach (ProviderCatalog::all() as $p) {
            if (!$p->isEnabled($this->settings)) {
                continue;
            }
            $configured = $p->isConfigured($this->settings);
            if ($configured) {
                $anyConfigured = true;
            }
            $enabled[] = [
                'id' => $p->id(),
                'label' => $p->label(),
                'group' => $p->group(),
                'configured' => $configured,
            ];
        }

        $default = $this->resolveProviderId(null);
        $defaultProvider = ProviderCatalog::get($default);
        $allowOpen = (bool) ($this->settings['allow_open_amount'] ?? false);
        $requireCatalog = (bool) ($this->settings['require_catalog_item'] ?? true);
        // When acquiring is ready — catalog purchase by default (not donation).
        $catalogMode = $anyConfigured && $requireCatalog && !$allowOpen;

        return [
            'providers' => $enabled,
            'provider' => $default,
            'default_provider' => $default,
            'currency' => (string) ($this->settings['currency'] ?? 'RUB'),
            'currency_symbol' => (string) ($this->settings['currency_symbol'] ?? '₽'),
            'merchant_name' => (string) ($this->settings['merchant_name'] ?? ''),
            'test_mode' => (bool) ($this->settings['test_mode'] ?? true),
            'success_url' => (string) ($this->settings['success_url'] ?? '/payment-success'),
            'fail_url' => (string) ($this->settings['fail_url'] ?? '/payment-fail'),
            'configured' => $defaultProvider?->isConfigured($this->settings) ?? false,
            'acquiring_ready' => $anyConfigured,
            'catalog_mode' => $catalogMode,
            'require_catalog_item' => $requireCatalog,
            'allow_open_amount' => $allowOpen,
            'offer_url' => (string) ($this->settings['offer_url'] ?? '/offer'),
            'offer_title' => (string) ($this->settings['offer_title'] ?? 'Публичная оферта'),
            'offer_html' => (string) ($this->settings['offer_html'] ?? ''),
            'seller' => [
                'name' => (string) ($this->settings['seller_name'] ?? ''),
                'inn' => (string) ($this->settings['seller_inn'] ?? ''),
                'ogrn' => (string) ($this->settings['seller_ogrn'] ?? ''),
                'address' => (string) ($this->settings['seller_address'] ?? ''),
                'email' => (string) ($this->settings['seller_email'] ?? ''),
                'phone' => (string) ($this->settings['seller_phone'] ?? ''),
            ],
            'payment_icons' => $this->parsePaymentIcons((string) ($this->settings['payment_icons'] ?? 'mir,visa,mastercard,sbp')),
            'catalog' => (new CommerceCatalog($this->db))->listPurchasable(),
            'stripe_publishable_key' => (string) ($this->settings['stripe_publishable_key'] ?? ''),
            'cloudpayments_public_id' => (string) ($this->settings['cloudpayments_public_id'] ?? ''),
            'adyen_client_key' => (string) ($this->settings['adyen_client_key'] ?? ''),
            'paypal_client_id' => (string) ($this->settings['paypal_client_id'] ?? ''),
        ];
    }

    /** @return list<string> */
    private function parsePaymentIcons(string $raw): array
    {
        $allowed = ['mir', 'visa', 'mastercard', 'unionpay', 'sbp', 'paypal', 'applepay', 'googlepay'];
        $out = [];
        foreach (explode(',', $raw) as $part) {
            $id = strtolower(trim($part));
            if ($id !== '' && in_array($id, $allowed, true) && !in_array($id, $out, true)) {
                $out[] = $id;
            }
        }
        return $out !== [] ? $out : ['mir', 'visa', 'mastercard'];
    }

    /**
     * @param array<string, mixed> $input
     * @return array<string, mixed>
     */
    public function checkout(array $input): array
    {
        $providerId = $this->resolveProviderId(isset($input['provider']) ? (string) $input['provider'] : null);
        $provider = ProviderCatalog::get($providerId);
        if ($provider === null) {
            Response::json(['success' => false, 'error' => 'Неизвестный провайдер'], 422);
        }
        if (!$provider->isEnabled($this->settings)) {
            Response::json(['success' => false, 'error' => "Провайдер «{$provider->label()}» выключен"], 422);
        }
        if (!$provider->isConfigured($this->settings)) {
            Response::json([
                'success' => false,
                'error' => "Провайдер «{$provider->label()}» не настроен. Заполните ключи в Плагины → Payments.",
            ], 422);
        }

        $anyConfigured = $this->hasConfiguredProvider();
        $allowOpen = (bool) ($this->settings['allow_open_amount'] ?? false);
        $requireCatalog = (bool) ($this->settings['require_catalog_item'] ?? true);
        $catalogMode = $anyConfigured && $requireCatalog && !$allowOpen;

        $email = trim((string) ($input['email'] ?? $input['customer_email'] ?? ''));
        $name = trim((string) ($input['name'] ?? $input['customer_name'] ?? ''));
        $acceptOffer = filter_var($input['accept_offer'] ?? false, FILTER_VALIDATE_BOOLEAN);

        $itemType = strtolower(trim((string) ($input['item_type'] ?? '')));
        $itemId = (int) ($input['item_id'] ?? 0);
        $variantIndex = isset($input['variant_index']) && $input['variant_index'] !== '' && $input['variant_index'] !== null
            ? (int) $input['variant_index']
            : null;
        $catalogItem = null;
        $amount = 0.0;
        $currency = strtoupper((string) ($this->settings['currency'] ?? 'RUB'));
        $description = trim((string) ($input['description'] ?? $this->settings['default_description'] ?? 'Оплата заказа'));
        $items = [];

        if ($catalogMode || ($itemType !== '' && $itemId > 0)) {
            if (!$acceptOffer) {
                Response::json([
                    'success' => false,
                    'error' => 'Подтвердите согласие с договором-офертой',
                ], 422);
            }
            $catalogItem = (new CommerceCatalog($this->db))->resolve($itemType, $itemId, $variantIndex);
            if (!$catalogItem) {
                Response::json([
                    'success' => false,
                    'error' => 'Выберите услугу или товар из каталога',
                ], 422);
            }
            // Price only from server catalog — ignore client amount.
            $amount = (float) $catalogItem['price'];
            $currency = (string) $catalogItem['currency'];
            $description = (string) $catalogItem['title'];
            $items = [[
                'type' => $catalogItem['type'],
                'id' => $catalogItem['id'],
                'title' => $catalogItem['title'],
                'qty' => 1,
                'unit_price' => $amount,
                'price' => $amount,
                'variant_index' => $catalogItem['variant_index'] ?? null,
                'variant_label' => $catalogItem['variant_label'] ?? null,
            ]];
        } else {
            if ($catalogMode) {
                Response::json(['success' => false, 'error' => 'Выберите услугу или товар'], 422);
            }
            $amount = round((float) ($input['amount'] ?? 0), 2);
            if ($amount <= 0) {
                Response::json(['success' => false, 'error' => 'Укажите сумму больше нуля'], 422);
            }
            $currency = strtoupper((string) ($input['currency'] ?? $currency));
            $rawItems = $input['items'] ?? null;
            $items = is_array($rawItems)
                ? $rawItems
                : [['title' => $description, 'qty' => 1, 'price' => $amount]];
        }

        if ($amount <= 0) {
            Response::json(['success' => false, 'error' => 'Сумма должна быть больше нуля'], 422);
        }

        $orderNumber = 'ORD-' . strtoupper(bin2hex(random_bytes(4))) . '-' . date('ymd');
        $orderId = 0;
        if ($this->ordersModuleEnabled() && class_exists(\App\Modules\Orders\OrdersService::class)) {
            try {
                $order = (new \App\Modules\Orders\OrdersService($this->db))->createOrderFromCheckout([
                    'number' => $orderNumber,
                    'email' => $email,
                    'name' => $name,
                    'currency' => $currency,
                    'items' => $items,
                    'source' => 'payments',
                    'metadata' => [
                        'item_type' => $catalogItem['type'] ?? null,
                        'item_id' => $catalogItem['id'] ?? null,
                        'offer_accepted' => $acceptOffer || $catalogItem,
                    ],
                ]);
                $orderId = (int) ($order['id'] ?? 0);
            } catch (\Throwable) {
                // Orders is an optional adapter; legacy checkout must keep working.
                $orderId = 0;
            }
        }
        $hasItemCols = $this->ordersHaveItemColumns();
        if ($orderId > 0 && $hasItemCols) {
            $this->db->run(
                'UPDATE orders SET item_type=?,item_id=?,offer_accepted=? WHERE id=?',
                [$catalogItem['type'] ?? null, $catalogItem['id'] ?? null, $acceptOffer || $catalogItem ? 1 : 0, $orderId],
            );
        } elseif ($orderId === 0 && $hasItemCols) {
            $this->db->run(
                'INSERT INTO orders (number, customer_email, customer_name, amount, currency, status, items, item_type, item_id, offer_accepted)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                [
                    $orderNumber,
                    $email !== '' ? $email : null,
                    $name !== '' ? $name : null,
                    $amount,
                    $currency,
                    'new',
                    json_encode($items, JSON_UNESCAPED_UNICODE),
                    $catalogItem['type'] ?? null,
                    $catalogItem['id'] ?? null,
                    $acceptOffer || $catalogItem ? 1 : 0,
                ],
            );
            $orderId = (int) $this->db->id();
        } elseif ($orderId === 0) {
            $this->db->run(
                'INSERT INTO orders (number, customer_email, customer_name, amount, currency, status, items)
                 VALUES (?, ?, ?, ?, ?, ?, ?)',
                [
                    $orderNumber,
                    $email !== '' ? $email : null,
                    $name !== '' ? $name : null,
                    $amount,
                    $currency,
                    'new',
                    json_encode($items, JSON_UNESCAPED_UNICODE),
                ],
            );
            $orderId = (int) $this->db->id();
        }

        $this->db->run(
            'INSERT INTO payments (provider, external_id, order_id, amount, currency, status, raw_payload)
             VALUES (?, ?, ?, ?, ?, ?, ?)',
            [
                $providerId,
                'local_' . $orderNumber,
                $orderId,
                $amount,
                $currency,
                'pending',
                json_encode([
                    'stage' => 'created',
                    'description' => $description,
                    'item_type' => $catalogItem['type'] ?? null,
                    'item_id' => $catalogItem['id'] ?? null,
                ], JSON_UNESCAPED_UNICODE),
            ],
        );
        $paymentId = $this->db->id();

        $req = new CheckoutRequest($paymentId, $orderId, $orderNumber, $amount, $currency, $description, $email, $name);
        $result = $provider->startCheckout($req, $this->ctx);

        return array_merge([
            'order_id' => $orderId,
            'order_number' => $orderNumber,
            'payment_id' => $paymentId,
            'provider' => $providerId,
            'provider_label' => $provider->label(),
            'amount' => $amount,
            'currency' => $currency,
            'item' => $catalogItem,
        ], $result);
    }

    private function hasConfiguredProvider(): bool
    {
        foreach (ProviderCatalog::all() as $p) {
            if ($p->isEnabled($this->settings) && $p->isConfigured($this->settings)) {
                return true;
            }
        }
        return false;
    }

    private function ordersHaveItemColumns(): bool
    {
        try {
            return $this->db->inspector()->columnExists('orders', 'item_type');
        } catch (\Throwable) {
            return false;
        }
    }

    /** @return array<string, mixed>|string */
    public function handleWebhook(Request $r): array|string
    {
        $providerId = $this->detectWebhookProvider($r);
        $provider = ProviderCatalog::get($providerId);
        if ($provider === null) {
            Response::json(['success' => false, 'error' => 'Unknown provider'], 404);
        }
        if (!$provider->verifyWebhook($r, $this->settings)) {
            Response::json(['success' => false, 'error' => 'Invalid signature'], 401);
        }

        [$externalId, $status, $amount, $currency, $orderId] = $provider->parseWebhook($r, $this->settings);
        if ($externalId === '') {
            Response::json(['success' => false, 'error' => 'Missing payment id'], 422);
        }

        $existing = $this->db->one(
            'SELECT id, order_id FROM payments WHERE provider = ? AND external_id = ?',
            [$providerId, $externalId],
        );
        // Robokassa uses InvId = local payment id
        if (!$existing && $providerId === 'robokassa') {
            $inv = (int) ($r->input('InvId') ?? 0);
            if ($inv > 0) {
                $existing = $this->db->one('SELECT id, order_id FROM payments WHERE id = ?', [$inv]);
            }
        }
        // UnitPay / Robokassa / PayAnyWay may match by order number in external_id prefix
        if (!$existing) {
            $existing = $this->db->one(
                'SELECT id, order_id FROM payments WHERE provider = ? AND (external_id = ? OR external_id LIKE ?)',
                [$providerId, $externalId, '%' . $externalId],
            );
        }

        $this->db->upsert(
            'payments',
            [
                'provider' => $providerId,
                'external_id' => $externalId,
                'order_id' => $orderId ?? ($existing['order_id'] ?? null),
                'amount' => $amount,
                'currency' => $currency,
                'status' => $status,
                'raw_payload' => $r->rawBody() !== '' ? $r->rawBody() : json_encode($r->all(), JSON_UNESCAPED_UNICODE),
            ],
            ['provider', 'external_id'],
            ['status', 'raw_payload', 'amount', 'currency', 'order_id'],
        );

        $resolvedOrderId = $orderId ?? (isset($existing['order_id']) ? (int) $existing['order_id'] : null);
        if ($resolvedOrderId && in_array($status, ['succeeded', 'paid'], true)) {
            $this->syncOrderStatus($resolvedOrderId, 'paid');
            $this->decrementProductStock($resolvedOrderId);
        } elseif ($resolvedOrderId && in_array($status, ['failed', 'canceled', 'cancelled'], true)) {
            $this->syncOrderStatus($resolvedOrderId, 'cancelled');
        }

        $activity = new \App\Services\ActivityLogService($this->db);
        $activity->log($r, 'webhook', 'payments', null, "$providerId:$externalId", ['status' => $status]);

        if ($providerId === 'robokassa') {
            $invId = (string) ($r->input('InvId') ?? '');
            return 'OK' . $invId;
        }

        return $provider->webhookAck();
    }

    public function paymentStatus(int $id): ?array
    {
        $row = $this->db->one(
            'SELECT p.id, p.provider, p.external_id, p.amount, p.currency, p.status, p.order_id,
                    o.number AS order_number, o.status AS order_status
             FROM payments p
             LEFT JOIN orders o ON o.id = p.order_id
             WHERE p.id = ?',
            [$id],
        );
        return $row ?: null;
    }

    private function decrementProductStock(int $orderId): void
    {
        try {
            if (!$this->db->inspector()->tableExists('products')) {
                return;
            }
            $order = $this->db->one('SELECT item_type, item_id FROM orders WHERE id=?', [$orderId]);
            if (!$order || ($order['item_type'] ?? '') !== 'product') {
                return;
            }
            $pid = (int) ($order['item_id'] ?? 0);
            if ($pid < 1) {
                return;
            }
            $this->db->run(
                'UPDATE products SET stock = stock - 1 WHERE id=? AND stock IS NOT NULL AND stock > 0',
                [$pid],
            );
        } catch (\Throwable) {
            // stock is best-effort
        }
    }

    private function ordersModuleEnabled(): bool
    {
        try {
            $row = $this->db->one("SELECT is_enabled FROM modules WHERE name='orders' LIMIT 1");
            return (int) ($row['is_enabled'] ?? 0) === 1;
        } catch (\Throwable) {
            return false;
        }
    }

    private function syncOrderStatus(int $orderId, string $status): void
    {
        if ($this->ordersModuleEnabled() && class_exists(\App\Modules\Orders\OrdersService::class)) {
            try {
                (new \App\Modules\Orders\OrdersService($this->db))->transitionStatus($orderId, $status, null, 'Payment webhook');
                return;
            } catch (\InvalidArgumentException) {
                // A late/duplicate webhook must not move a fulfilled order backwards.
                return;
            } catch (\Throwable) {
            }
        }
        $this->db->run('UPDATE orders SET status = ? WHERE id = ?', [$status, $orderId]);
    }

    private function resolveProviderId(?string $requested): string
    {
        $requested = $requested !== null ? strtolower(trim($requested)) : '';
        if ($requested !== '' && ProviderCatalog::get($requested)) {
            return $requested;
        }
        $default = strtolower((string) ($this->settings['default_provider'] ?? $this->settings['provider'] ?? 'manual'));
        if (ProviderCatalog::get($default)) {
            return $default;
        }
        return 'manual';
    }

    private function detectWebhookProvider(Request $r): string
    {
        $hint = strtolower((string) ($r->query('provider') ?? $r->input('provider') ?? ''));
        if ($hint !== '' && ProviderCatalog::get($hint)) {
            return $hint;
        }
        if ($r->header('Stripe-Signature')) {
            return 'stripe';
        }
        if ($r->header('Paddle-Signature')) {
            return 'paddle';
        }
        if ($r->header('X-Signature') && str_contains((string) ($r->header('User-Agent') ?? ''), 'Lemon')) {
            return 'lemonsqueezy';
        }
        if ($r->header('x-nowpayments-sig')) {
            return 'crypto';
        }
        if ($r->header('Content-HMAC') || $r->header('X-Content-HMAC')) {
            return 'cloudpayments';
        }
        if ($r->input('OutSum') !== null && $r->input('InvId') !== null) {
            return 'robokassa';
        }
        if ($r->input('MNT_ID') !== null) {
            return 'payanyway';
        }
        if ($r->input('method') !== null && (is_array($r->input('params')) || $r->query('method'))) {
            return 'unitpay';
        }
        $event = $r->input('event');
        if (is_string($event) && str_contains($event, 'payment.')) {
            return 'yookassa';
        }
        if ($r->input('TerminalKey') !== null || $r->input('PaymentId') !== null) {
            return 'tkassa';
        }
        if (is_array($r->input('notificationItems'))) {
            return 'adyen';
        }
        if (is_string($r->input('event_type')) && str_contains((string) $r->input('event_type'), 'PAYMENT')) {
            return 'paypal';
        }
        return $this->resolveProviderId(null);
    }
}
