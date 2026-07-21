<?php
declare(strict_types=1);

namespace App\Modules\Payments\Providers;

use App\Request;

/** Manual + YooKassa + Stripe + CloudPayments */
final class ManualProvider extends AbstractProvider
{
    public function id(): string { return 'manual'; }
    public function label(): string { return 'Вручную'; }
    public function group(): string { return 'other'; }

    public function credentialFields(): array
    {
        return [];
    }

    public function isConfigured(array $settings): bool
    {
        return true;
    }

    public function startCheckout(CheckoutRequest $req, ProviderContext $ctx): array
    {
        $ctx->updatePayment($req->paymentId, 'manual_' . $req->orderNumber, 'pending', ['stage' => 'manual']);
        return [
            'mode' => 'redirect',
            'redirect_url' => $ctx->successUrl($req->orderNumber),
            'message' => 'Заказ создан. Подтвердите оплату вручную в админке.',
        ];
    }
}

final class YooKassaProvider extends AbstractProvider
{
    public function id(): string { return 'yookassa'; }
    public function label(): string { return 'ЮKassa'; }
    public function group(): string { return 'ru'; }

    public function credentialFields(): array
    {
        return [
            ['key' => 'yookassa_shop_id', 'label' => 'ЮKassa — shopId', 'type' => 'text', 'default' => ''],
            ['key' => 'yookassa_secret_key', 'label' => 'ЮKassa — секретный ключ', 'type' => 'text', 'default' => ''],
            ['key' => 'yookassa_vat_code', 'label' => 'ЮKassa — код НДС', 'type' => 'number', 'default' => 1],
            ['key' => 'yookassa_webhook_secret', 'label' => 'ЮKassa — токен вебхука', 'type' => 'text', 'default' => '',
                'help' => 'Опционально: ?token= на URL вебхука'],
        ];
    }

    public function isConfigured(array $settings): bool
    {
        return trim((string) ($settings['yookassa_shop_id'] ?? '')) !== ''
            && trim((string) ($settings['yookassa_secret_key'] ?? '')) !== '';
    }

    public function startCheckout(CheckoutRequest $req, ProviderContext $ctx): array
    {
        $body = [
            'amount' => ['value' => $req->amountFixed(), 'currency' => $req->currency],
            'capture' => true,
            'confirmation' => ['type' => 'redirect', 'return_url' => $ctx->successUrl($req->orderNumber)],
            'description' => mb_substr($req->description, 0, 128),
            'metadata' => [
                'order_id' => $req->orderId,
                'payment_id' => $req->paymentId,
                'order_number' => $req->orderNumber,
            ],
        ];
        if ($req->email !== '') {
            $body['receipt'] = [
                'customer' => ['email' => $req->email],
                'items' => [[
                    'description' => mb_substr($req->description, 0, 128),
                    'quantity' => '1.00',
                    'amount' => ['value' => $req->amountFixed(), 'currency' => $req->currency],
                    'vat_code' => (int) $ctx->setting('yookassa_vat_code', 1),
                    'payment_mode' => 'full_payment',
                    'payment_subject' => 'service',
                ]],
            ];
        }
        $res = $ctx->httpJson('POST', 'https://api.yookassa.ru/v3/payments', $body, [
            'Authorization: Basic ' . base64_encode((string) $ctx->setting('yookassa_shop_id') . ':' . (string) $ctx->setting('yookassa_secret_key')),
            'Idempotence-Key: ' . bin2hex(random_bytes(16)),
        ]);
        $ext = (string) ($res['id'] ?? '');
        $url = (string) ($res['confirmation']['confirmation_url'] ?? '');
        if ($ext === '' || $url === '') {
            $ctx->fail('ЮKassa не вернула ссылку на оплату', $res);
        }
        $ctx->updatePayment($req->paymentId, $ext, (string) ($res['status'] ?? 'pending'), $res);
        return ['mode' => 'redirect', 'redirect_url' => $url, 'external_id' => $ext];
    }

    public function verifyWebhook(Request $r, array $settings): bool
    {
        $token = trim((string) ($settings['yookassa_webhook_secret'] ?? $settings['webhook_secret'] ?? ''));
        if ($token === '') {
            return true;
        }
        $provided = (string) ($r->query('token') ?? $r->header('X-Webhook-Token') ?? '');
        return $provided !== '' && hash_equals($token, $provided);
    }

    public function parseWebhook(Request $r, array $settings): array
    {
        $payload = $r->all();
        $obj = is_array($payload['object'] ?? null) ? $payload['object'] : $payload;
        $statusRaw = (string) ($obj['status'] ?? 'pending');
        $status = match ($statusRaw) {
            'succeeded' => 'succeeded',
            'canceled' => 'failed',
            default => $statusRaw === 'waiting_for_capture' ? 'pending' : $statusRaw,
        };
        $meta = is_array($obj['metadata'] ?? null) ? $obj['metadata'] : [];
        return [
            (string) ($obj['id'] ?? ''),
            $status,
            (float) ($obj['amount']['value'] ?? 0),
            (string) ($obj['amount']['currency'] ?? 'RUB'),
            isset($meta['order_id']) ? (int) $meta['order_id'] : null,
        ];
    }
}

final class StripeProvider extends AbstractProvider
{
    public function id(): string { return 'stripe'; }
    public function label(): string { return 'Stripe'; }
    public function group(): string { return 'intl'; }

    public function credentialFields(): array
    {
        return [
            ['key' => 'stripe_publishable_key', 'label' => 'Stripe — publishable key', 'type' => 'text', 'default' => ''],
            ['key' => 'stripe_secret_key', 'label' => 'Stripe — secret key', 'type' => 'text', 'default' => ''],
            ['key' => 'stripe_webhook_secret', 'label' => 'Stripe — webhook secret (whsec_…)', 'type' => 'text', 'default' => ''],
        ];
    }

    public function isConfigured(array $settings): bool
    {
        return trim((string) ($settings['stripe_secret_key'] ?? '')) !== '';
    }

    public function startCheckout(CheckoutRequest $req, ProviderContext $ctx): array
    {
        $params = [
            'mode' => 'payment',
            'success_url' => $ctx->successUrl($req->orderNumber) . '&session_id={CHECKOUT_SESSION_ID}',
            'cancel_url' => $ctx->failUrl($req->orderNumber),
            'client_reference_id' => (string) $req->orderId,
            'metadata[order_id]' => (string) $req->orderId,
            'metadata[payment_id]' => (string) $req->paymentId,
            'metadata[order_number]' => $req->orderNumber,
            'line_items[0][price_data][currency]' => strtolower($req->currency),
            'line_items[0][price_data][product_data][name]' => mb_substr($req->description, 0, 120),
            'line_items[0][price_data][unit_amount]' => (string) $req->amountMinor(),
            'line_items[0][quantity]' => '1',
        ];
        if ($req->email !== '') {
            $params['customer_email'] = $req->email;
        }
        $res = $ctx->httpForm('POST', 'https://api.stripe.com/v1/checkout/sessions', $params, [
            'Authorization: Bearer ' . (string) $ctx->setting('stripe_secret_key'),
        ]);
        $ext = (string) ($res['id'] ?? '');
        $url = (string) ($res['url'] ?? '');
        if ($ext === '' || $url === '') {
            $ctx->fail('Stripe не вернул Checkout Session', $res);
        }
        $ctx->updatePayment($req->paymentId, $ext, 'pending', $res);
        return ['mode' => 'redirect', 'redirect_url' => $url, 'external_id' => $ext];
    }

    public function verifyWebhook(Request $r, array $settings): bool
    {
        $secret = trim((string) ($settings['stripe_webhook_secret'] ?? ''));
        if ($secret === '') {
            return (bool) ($settings['test_mode'] ?? true);
        }
        $sigHeader = (string) ($r->header('Stripe-Signature') ?? '');
        if ($sigHeader === '') {
            return false;
        }
        $parts = [];
        foreach (explode(',', $sigHeader) as $piece) {
            [$k, $v] = array_pad(explode('=', trim($piece), 2), 2, '');
            $parts[$k] = $v;
        }
        $t = $parts['t'] ?? '';
        $v1 = $parts['v1'] ?? '';
        if ($t === '' || $v1 === '' || abs(time() - (int) $t) > 300) {
            return false;
        }
        return hash_equals(hash_hmac('sha256', $t . '.' . $r->rawBody(), $secret), $v1);
    }

    public function parseWebhook(Request $r, array $settings): array
    {
        $payload = $r->all();
        $type = (string) ($payload['type'] ?? '');
        $obj = is_array($payload['data']['object'] ?? null) ? $payload['data']['object'] : [];
        $status = match (true) {
            str_contains($type, 'completed') || ($obj['payment_status'] ?? '') === 'paid' => 'succeeded',
            str_contains($type, 'expired') || str_contains($type, 'failed') => 'failed',
            default => 'pending',
        };
        $amount = isset($obj['amount_total'])
            ? ((float) $obj['amount_total']) / 100
            : ((float) ($obj['amount'] ?? 0)) / 100;
        $meta = is_array($obj['metadata'] ?? null) ? $obj['metadata'] : [];
        $orderId = isset($meta['order_id']) ? (int) $meta['order_id']
            : (isset($obj['client_reference_id']) ? (int) $obj['client_reference_id'] : null);
        return [
            (string) ($obj['id'] ?? ''),
            $status,
            $amount,
            strtoupper((string) ($obj['currency'] ?? 'RUB')),
            $orderId,
        ];
    }
}

final class CloudPaymentsProvider extends AbstractProvider
{
    public function id(): string { return 'cloudpayments'; }
    public function label(): string { return 'CloudPayments'; }
    public function group(): string { return 'ru'; }

    public function credentialFields(): array
    {
        return [
            ['key' => 'cloudpayments_public_id', 'label' => 'CloudPayments — Public ID', 'type' => 'text', 'default' => ''],
            ['key' => 'cloudpayments_api_secret', 'label' => 'CloudPayments — API Secret', 'type' => 'text', 'default' => ''],
        ];
    }

    public function isConfigured(array $settings): bool
    {
        return trim((string) ($settings['cloudpayments_public_id'] ?? '')) !== ''
            && trim((string) ($settings['cloudpayments_api_secret'] ?? '')) !== '';
    }

    public function startCheckout(CheckoutRequest $req, ProviderContext $ctx): array
    {
        return [
            'mode' => 'widget',
            'widget' => [
                'publicId' => (string) $ctx->setting('cloudpayments_public_id'),
                'description' => $req->description,
                'amount' => $req->amount,
                'currency' => $req->currency,
                'invoiceId' => $req->orderNumber,
                'accountId' => $req->email !== '' ? $req->email : null,
                'email' => $req->email !== '' ? $req->email : null,
                'data' => ['order_id' => $req->orderId, 'payment_id' => $req->paymentId],
                'skin' => 'mini',
            ],
            'success_url' => $ctx->successUrl($req->orderNumber),
            'fail_url' => $ctx->failUrl($req->orderNumber),
        ];
    }

    public function verifyWebhook(Request $r, array $settings): bool
    {
        $secret = trim((string) ($settings['cloudpayments_api_secret'] ?? ''));
        if ($secret === '') {
            return false;
        }
        $hmac = (string) ($r->header('Content-HMAC') ?? $r->header('X-Content-HMAC') ?? '');
        if ($hmac === '') {
            return false;
        }
        $expected = base64_encode(hash_hmac('sha256', $r->rawBody(), $secret, true));
        return hash_equals(strtolower($expected), strtolower($hmac));
    }

    public function parseWebhook(Request $r, array $settings): array
    {
        $p = $r->all();
        $ext = (string) ($p['TransactionId'] ?? $p['InvoiceId'] ?? '');
        $statusRaw = strtolower((string) ($p['Status'] ?? $p['status'] ?? ''));
        $ok = in_array($statusRaw, ['completed', 'authorized', 'success', 'succeeded'], true)
            || !empty($p['Success']);
        $data = $p['Data'] ?? null;
        if (is_string($data)) {
            $data = json_decode($data, true);
        }
        return [
            $ext,
            $ok ? 'succeeded' : (in_array($statusRaw, ['declined', 'cancelled', 'canceled'], true) ? 'failed' : 'pending'),
            (float) ($p['Amount'] ?? $p['amount'] ?? 0),
            (string) ($p['Currency'] ?? $p['currency'] ?? 'RUB'),
            is_array($data) && isset($data['order_id']) ? (int) $data['order_id'] : null,
        ];
    }

    public function webhookAck(): array
    {
        return ['code' => 0];
    }
}
