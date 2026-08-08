<?php
declare(strict_types=1);

namespace App\PackageModules\Payments;

use App\Platform\Contracts\PlatformDatabaseInterface;


use App\Platform\Contracts\PlatformCatalogInterface;
use App\Platform\Contracts\PlatformOrdersInterface;
use App\PackageModules\Payments\Providers\CheckoutRequest;
use App\PackageModules\Payments\Providers\ProviderCatalog;
use App\PackageModules\Payments\Providers\ProviderContext;
use App\Platform\Contracts\PlatformRequestInterface;
use App\Platform\Package\PlatformResponse;
use App\Platform\Contracts\PlatformHttpInterface;
use App\Platform\Contracts\PlatformConfigInterface;
use App\Platform\Contracts\PlatformEventsInterface;

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
        private PlatformDatabaseInterface $db,
        private array $settings,
        PlatformHttpInterface $http, PlatformConfigInterface $config, string $apiPrefix,
        private PlatformOrdersInterface $orders,
        private PlatformCatalogInterface $catalog, private PlatformEventsInterface $events,
    ) {
        $this->ctx = new ProviderContext($db, $settings, $http, $config, $apiPrefix);
        
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
            'catalog' => (new CommerceCatalog($this->db, $this->catalog))->listPurchasable(),
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
            PlatformResponse::json(['success' => false, 'error' => 'Неизвестный провайдер'], 422);
        }
        if (!$provider->isEnabled($this->settings)) {
            PlatformResponse::json(['success' => false, 'error' => "Провайдер «{$provider->label()}» выключен"], 422);
        }
        if (!$provider->isConfigured($this->settings)) {
            PlatformResponse::json([
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
                PlatformResponse::json([
                    'success' => false,
                    'error' => 'Подтвердите согласие с договором-офертой',
                ], 422);
            }
            $catalogItem = (new CommerceCatalog($this->db, $this->catalog))->resolve($itemType, $itemId, $variantIndex);
            if (!$catalogItem) {
                PlatformResponse::json([
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
                PlatformResponse::json(['success' => false, 'error' => 'Выберите услугу или товар'], 422);
            }
            $amount = round((float) ($input['amount'] ?? 0), 2);
            if ($amount <= 0) {
                PlatformResponse::json(['success' => false, 'error' => 'Укажите сумму больше нуля'], 422);
            }
            $currency = strtoupper((string) ($input['currency'] ?? $currency));
            $rawItems = $input['items'] ?? null;
            $items = is_array($rawItems)
                ? $rawItems
                : [['title' => $description, 'qty' => 1, 'price' => $amount]];
        }

        if ($amount <= 0) {
            PlatformResponse::json(['success' => false, 'error' => 'Сумма должна быть больше нуля'], 422);
        }

        $orderNumber = 'ORD-' . strtoupper(bin2hex(random_bytes(4))) . '-' . date('ymd');
        $orderId = 0;
        if ($this->orders->isAvailable()) {
            try {
                $order = $this->orders->createFromCheckout([
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
        if ($orderId === 0) {
            PlatformResponse::json(['success' => false, 'error' => 'Orders service is unavailable'], 503);
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
        $paymentId = $this->db->lastInsertId();

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
    public function handleWebhook(PlatformRequestInterface $r): array|string
    {
        $providerId = $this->detectWebhookProvider($r);
        $provider = ProviderCatalog::get($providerId);
        if ($provider === null) {
            PlatformResponse::json(['success' => false, 'error' => 'Unknown provider'], 404);
        }
        if (!$provider->verifyWebhook($r, $this->settings)) {
            PlatformResponse::json(['success' => false, 'error' => 'Invalid signature'], 401);
        }

        [$externalId, $status, $amount, $currency, $orderId] = $provider->parseWebhook($r, $this->settings);
        if ($externalId === '') {
            PlatformResponse::json(['success' => false, 'error' => 'Missing payment id'], 422);
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
                'raw_payload' => (string) json_encode($r->body(), JSON_UNESCAPED_UNICODE) !== '' ? (string) json_encode($r->body(), JSON_UNESCAPED_UNICODE) : json_encode($r->body(), JSON_UNESCAPED_UNICODE),
            ],
            ['provider', 'external_id'],
            ['status', 'raw_payload', 'amount', 'currency', 'order_id'],
        );

        $resolvedOrderId = $orderId ?? (isset($existing['order_id']) ? (int) $existing['order_id'] : null);
        if ($resolvedOrderId && in_array($status, ['succeeded', 'paid'], true)) {
            $this->syncOrderStatus($resolvedOrderId, 'paid');
            $this->decrementProductStock($resolvedOrderId);
            $this->dispatchPaymentCompleted($resolvedOrderId, $providerId, $externalId, $amount, $currency);
        } elseif ($resolvedOrderId && in_array($status, ['failed', 'canceled', 'cancelled'], true)) {
            $this->syncOrderStatus($resolvedOrderId, 'cancelled');
        }

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
            $items = $this->db->all('SELECT product_id, quantity FROM order_items WHERE order_id=? AND product_id IS NOT NULL', [$orderId]);
            foreach ($items as $item) {
                $this->catalog->decrementStock((int) $item['product_id'], max(1, (int) $item['quantity']));
            }
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
        if ($this->orders->isAvailable()) {
            try {
                $this->orders->transitionStatus($orderId, $status, null, 'Payment webhook');
                return;
            } catch (\InvalidArgumentException) {
                // A late/duplicate webhook must not move a fulfilled order backwards.
                return;
            } catch (\Throwable) {
            }
        }
        // Package facade is deliberately authoritative; never mutate orders directly.
    }

    private function dispatchPaymentCompleted(int $orderId, string $providerId, string $externalId, mixed $amount, mixed $currency): void
    {
        $this->events->publish('payment.completed', ['order_id'=>$orderId,'provider'=>$providerId,'external_id'=>$externalId,'amount'=>$amount,'currency'=>$currency]);
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

    private function detectWebhookProvider(PlatformRequestInterface $r): string
    {
        $hint = strtolower((string) (($r->query()['provider'] ?? null) ?? $r->input('provider') ?? ''));
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
        if ($r->input('method') !== null && (is_array($r->input('params')) || (($r->query()['method'] ?? null) !== null))) {
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
