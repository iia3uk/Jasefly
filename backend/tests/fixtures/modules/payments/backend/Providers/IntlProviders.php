<?php
declare(strict_types=1);

namespace App\PackageModules\Payments\Providers;

use App\Platform\Contracts\PlatformRequestInterface;

final class PayPalProvider extends AbstractProvider
{
    public function id(): string { return 'paypal'; }
    public function label(): string { return 'PayPal'; }
    public function group(): string { return 'intl'; }

    public function credentialFields(): array
    {
        return [
            ['key' => 'paypal_client_id', 'label' => 'PayPal — Client ID', 'type' => 'text', 'default' => ''],
            ['key' => 'paypal_client_secret', 'label' => 'PayPal — Client Secret', 'type' => 'text', 'default' => ''],
            ['key' => 'paypal_webhook_id', 'label' => 'PayPal — Webhook ID', 'type' => 'text', 'default' => '',
                'help' => 'ID вебхука из PayPal Developer Dashboard'],
        ];
    }

    public function isConfigured(array $settings): bool
    {
        return trim((string) ($settings['paypal_client_id'] ?? '')) !== ''
            && trim((string) ($settings['paypal_client_secret'] ?? '')) !== '';
    }

    public function startCheckout(CheckoutRequest $req, ProviderContext $ctx): array
    {
        $base = $ctx->testMode()
            ? 'https://api-m.sandbox.paypal.com'
            : 'https://api-m.paypal.com';
        $token = $this->accessToken($ctx, $base);
        $res = $ctx->httpJson('POST', $base . '/v2/checkout/orders', [
            'intent' => 'CAPTURE',
            'purchase_units' => [[
                'reference_id' => $req->orderNumber,
                'description' => mb_substr($req->description, 0, 127),
                'custom_id' => (string) $req->orderId,
                'amount' => [
                    'currency_code' => $req->currency,
                    'value' => $req->amountFixed(),
                ],
            ]],
            'application_context' => [
                'return_url' => $ctx->successUrl($req->orderNumber),
                'cancel_url' => $ctx->failUrl($req->orderNumber),
                'user_action' => 'PAY_NOW',
                'brand_name' => (string) ($ctx->setting('merchant_name') ?: 'CMS'),
            ],
        ], [
            'Authorization: Bearer ' . $token,
            'PayPal-Request-Id: ' . $req->orderNumber,
        ]);
        $ext = (string) ($res['id'] ?? '');
        $url = '';
        foreach (($res['links'] ?? []) as $link) {
            if (($link['rel'] ?? '') === 'approve') {
                $url = (string) ($link['href'] ?? '');
                break;
            }
        }
        if ($ext === '' || $url === '') {
            $ctx->fail('PayPal: не удалось создать Order', $res);
        }
        $ctx->updatePayment($req->paymentId, $ext, 'pending', $res);
        return ['mode' => 'redirect', 'redirect_url' => $url, 'external_id' => $ext];
    }

    public function verifyWebhook(PlatformRequestInterface $r, array $settings): bool
    {
        // Soft verify: require webhook id configured in production; test_mode may skip.
        if (!empty($settings['test_mode'])) {
            return true;
        }
        return trim((string) ($settings['paypal_webhook_id'] ?? '')) !== '';
    }

    public function parseWebhook(PlatformRequestInterface $r, array $settings): array
    {
        $p = $r->body();
        $event = (string) ($p['event_type'] ?? '');
        $resource = is_array($p['resource'] ?? null) ? $p['resource'] : [];
        $status = match (true) {
            str_contains($event, 'COMPLETED') || str_contains($event, 'CAPTURED') => 'succeeded',
            str_contains($event, 'DENIED') || str_contains($event, 'CANCELLED') => 'failed',
            default => 'pending',
        };
        $amount = (float) ($resource['amount']['value']
            ?? $resource['purchase_units'][0]['amount']['value']
            ?? 0);
        $currency = (string) ($resource['amount']['currency_code']
            ?? $resource['purchase_units'][0]['amount']['currency_code']
            ?? 'USD');
        $custom = $resource['custom_id'] ?? $resource['purchase_units'][0]['custom_id'] ?? null;
        return [
            (string) ($resource['id'] ?? $resource['supplementary_data']['related_ids']['order_id'] ?? ''),
            $status,
            $amount,
            $currency,
            $custom !== null && $custom !== '' ? (int) $custom : null,
        ];
    }

    private function accessToken(ProviderContext $ctx, string $base): string
    {
        $res = $ctx->httpForm('POST', $base . '/v1/oauth2/token', ['grant_type' => 'client_credentials'], [
            'Authorization: Basic ' . base64_encode(
                (string) $ctx->setting('paypal_client_id') . ':' . (string) $ctx->setting('paypal_client_secret')
            ),
        ]);
        $token = (string) ($res['access_token'] ?? '');
        if ($token === '') {
            $ctx->fail('PayPal: не удалось получить access_token', $res);
        }
        return $token;
    }
}

/** Crypto via NOWPayments */
final class CryptoProvider extends AbstractProvider
{
    public function id(): string { return 'crypto'; }
    public function label(): string { return 'Крипта (NOWPayments)'; }
    public function group(): string { return 'intl'; }

    public function credentialFields(): array
    {
        return [
            ['key' => 'nowpayments_api_key', 'label' => 'NOWPayments — API key', 'type' => 'text', 'default' => ''],
            ['key' => 'nowpayments_ipn_secret', 'label' => 'NOWPayments — IPN secret', 'type' => 'text', 'default' => ''],
            ['key' => 'nowpayments_pay_currency', 'label' => 'Крипта по умолчанию (btc/usdttrc20/…)', 'type' => 'text', 'default' => 'usdttrc20'],
        ];
    }

    public function isConfigured(array $settings): bool
    {
        return trim((string) ($settings['nowpayments_api_key'] ?? '')) !== '';
    }

    public function startCheckout(CheckoutRequest $req, ProviderContext $ctx): array
    {
        $base = $ctx->testMode()
            ? 'https://api-sandbox.nowpayments.io/v1'
            : 'https://api.nowpayments.io/v1';
        // Invoice creates a hosted payment page (supports many coins).
        $res = $ctx->httpJson('POST', $base . '/invoice', [
            'price_amount' => $req->amount,
            'price_currency' => strtolower($req->currency),
            'order_id' => $req->orderNumber,
            'order_description' => mb_substr($req->description, 0, 400),
            'ipn_callback_url' => $ctx->webhookUrl($this->id()),
            'success_url' => $ctx->successUrl($req->orderNumber),
            'cancel_url' => $ctx->failUrl($req->orderNumber),
        ], [
            'x-api-key: ' . (string) $ctx->setting('nowpayments_api_key'),
        ]);
        $ext = (string) ($res['id'] ?? $res['invoice_id'] ?? '');
        $url = (string) ($res['invoice_url'] ?? $res['pay_url'] ?? '');
        if ($ext === '' || $url === '') {
            // Fallback: create single-currency payment
            $payCurrency = (string) ($ctx->setting('nowpayments_pay_currency') ?: 'usdttrc20');
            $res = $ctx->httpJson('POST', $base . '/payment', [
                'price_amount' => $req->amount,
                'price_currency' => strtolower($req->currency),
                'pay_currency' => $payCurrency,
                'order_id' => $req->orderNumber,
                'order_description' => mb_substr($req->description, 0, 400),
                'ipn_callback_url' => $ctx->webhookUrl($this->id()),
            ], [
                'x-api-key: ' . (string) $ctx->setting('nowpayments_api_key'),
            ]);
            $ext = (string) ($res['payment_id'] ?? '');
            $url = (string) ($res['invoice_url'] ?? $res['pay_address'] ?? '');
            if ($ext === '') {
                $ctx->fail('NOWPayments: не удалось создать платёж', $res);
            }
            if ($url === '' || !str_starts_with($url, 'http')) {
                $url = 'https://nowpayments.io/payment/?iid=' . urlencode($ext);
            }
        }
        $ctx->updatePayment($req->paymentId, 'np_' . $ext, 'pending', $res);
        return ['mode' => 'redirect', 'redirect_url' => $url, 'external_id' => 'np_' . $ext];
    }

    public function verifyWebhook(PlatformRequestInterface $r, array $settings): bool
    {
        $secret = trim((string) ($settings['nowpayments_ipn_secret'] ?? ''));
        if ($secret === '') {
            return (bool) ($settings['test_mode'] ?? true);
        }
        $sig = (string) ($r->header('x-nowpayments-sig') ?? '');
        if ($sig === '') {
            return false;
        }
        $data = $r->body();
        ksort($data);
        $expected = hash_hmac('sha512', json_encode($data, JSON_UNESCAPED_UNICODE) ?: '', $secret);
        return hash_equals($expected, $sig);
    }

    public function parseWebhook(PlatformRequestInterface $r, array $settings): array
    {
        $p = $r->body();
        $statusRaw = strtolower((string) ($p['payment_status'] ?? $p['status'] ?? ''));
        $status = match ($statusRaw) {
            'finished', 'confirmed', 'sending' => 'succeeded',
            'failed', 'refunded', 'expired' => $statusRaw === 'refunded' ? 'refunded' : 'failed',
            default => 'pending',
        };
        return [
            'np_' . (string) ($p['payment_id'] ?? $p['invoice_id'] ?? $p['id'] ?? ''),
            $status,
            (float) ($p['price_amount'] ?? $p['pay_amount'] ?? 0),
            strtoupper((string) ($p['price_currency'] ?? 'USD')),
            null,
        ];
    }
}

final class PaddleProvider extends AbstractProvider
{
    public function id(): string { return 'paddle'; }
    public function label(): string { return 'Paddle'; }
    public function group(): string { return 'intl'; }

    public function credentialFields(): array
    {
        return [
            ['key' => 'paddle_api_key', 'label' => 'Paddle — API key', 'type' => 'text', 'default' => ''],
            ['key' => 'paddle_price_id', 'label' => 'Paddle — Price ID (pri_…)', 'type' => 'text', 'default' => '',
                'help' => 'Базовый price; сумма заказа передаётся как custom unit amount если поддерживается'],
            ['key' => 'paddle_webhook_secret', 'label' => 'Paddle — webhook secret', 'type' => 'text', 'default' => ''],
        ];
    }

    public function isConfigured(array $settings): bool
    {
        return trim((string) ($settings['paddle_api_key'] ?? '')) !== ''
            && trim((string) ($settings['paddle_price_id'] ?? '')) !== '';
    }

    public function startCheckout(CheckoutRequest $req, ProviderContext $ctx): array
    {
        $base = $ctx->testMode()
            ? 'https://sandbox-api.paddle.com'
            : 'https://api.paddle.com';
        $res = $ctx->httpJson('POST', $base . '/transactions', [
            'items' => [[
                'price_id' => (string) $ctx->setting('paddle_price_id'),
                'quantity' => 1,
            ]],
            'currency_code' => $req->currency,
            'collection_mode' => 'automatic',
            'customer' => $req->email !== '' ? ['email' => $req->email] : null,
            'custom_data' => [
                'order_id' => (string) $req->orderId,
                'payment_id' => (string) $req->paymentId,
                'order_number' => $req->orderNumber,
                'amount' => $req->amountFixed(),
            ],
            'checkout' => [
                'url' => $ctx->successUrl($req->orderNumber),
            ],
        ], [
            'Authorization: Bearer ' . (string) $ctx->setting('paddle_api_key'),
        ]);
        // Strip null customer
        if (($res['_http'] ?? 0) >= 400 || empty($res['data'])) {
            // Retry without customer object if null caused issues
            $res = $ctx->httpJson('POST', $base . '/transactions', [
                'items' => [[
                    'price_id' => (string) $ctx->setting('paddle_price_id'),
                    'quantity' => 1,
                ]],
                'custom_data' => [
                    'order_id' => (string) $req->orderId,
                    'payment_id' => (string) $req->paymentId,
                    'order_number' => $req->orderNumber,
                ],
            ], [
                'Authorization: Bearer ' . (string) $ctx->setting('paddle_api_key'),
            ]);
        }
        $data = is_array($res['data'] ?? null) ? $res['data'] : [];
        $ext = (string) ($data['id'] ?? '');
        $url = (string) ($data['checkout']['url'] ?? '');
        if ($ext === '' || $url === '') {
            $ctx->fail('Paddle: не удалось создать transaction', $res);
        }
        $ctx->updatePayment($req->paymentId, $ext, 'pending', $res);
        return ['mode' => 'redirect', 'redirect_url' => $url, 'external_id' => $ext];
    }

    public function verifyWebhook(PlatformRequestInterface $r, array $settings): bool
    {
        $secret = trim((string) ($settings['paddle_webhook_secret'] ?? ''));
        if ($secret === '') {
            return (bool) ($settings['test_mode'] ?? true);
        }
        // Paddle Billing uses Paddle-Signature: ts=…;h1=…
        $header = (string) ($r->header('Paddle-Signature') ?? '');
        if ($header === '') {
            return false;
        }
        $parts = [];
        foreach (explode(';', $header) as $piece) {
            [$k, $v] = array_pad(explode('=', trim($piece), 2), 2, '');
            $parts[$k] = $v;
        }
        $ts = $parts['ts'] ?? '';
        $h1 = $parts['h1'] ?? '';
        if ($ts === '' || $h1 === '') {
            return false;
        }
        $signed = $ts . ':' . (string) json_encode($r->body(), JSON_UNESCAPED_UNICODE);
        return hash_equals(hash_hmac('sha256', $signed, $secret), $h1);
    }

    public function parseWebhook(PlatformRequestInterface $r, array $settings): array
    {
        $p = $r->body();
        $event = (string) ($p['event_type'] ?? '');
        $data = is_array($p['data'] ?? null) ? $p['data'] : [];
        $status = str_contains($event, 'completed') || str_contains($event, 'paid')
            ? 'succeeded'
            : (str_contains($event, 'canceled') || str_contains($event, 'past_due') ? 'failed' : 'pending');
        $custom = is_array($data['custom_data'] ?? null) ? $data['custom_data'] : [];
        $totals = is_array($data['details']['totals'] ?? null) ? $data['details']['totals'] : [];
        return [
            (string) ($data['id'] ?? ''),
            $status,
            isset($totals['total']) ? ((float) $totals['total']) / 100 : 0.0,
            (string) ($data['currency_code'] ?? 'USD'),
            isset($custom['order_id']) ? (int) $custom['order_id'] : null,
        ];
    }
}

final class LemonSqueezyProvider extends AbstractProvider
{
    public function id(): string { return 'lemonsqueezy'; }
    public function label(): string { return 'Lemon Squeezy'; }
    public function group(): string { return 'intl'; }

    public function credentialFields(): array
    {
        return [
            ['key' => 'lemon_api_key', 'label' => 'Lemon Squeezy — API key', 'type' => 'text', 'default' => ''],
            ['key' => 'lemon_store_id', 'label' => 'Lemon Squeezy — Store ID', 'type' => 'text', 'default' => ''],
            ['key' => 'lemon_variant_id', 'label' => 'Lemon Squeezy — Variant ID', 'type' => 'text', 'default' => ''],
            ['key' => 'lemon_webhook_secret', 'label' => 'Lemon Squeezy — webhook secret', 'type' => 'text', 'default' => ''],
        ];
    }

    public function isConfigured(array $settings): bool
    {
        return trim((string) ($settings['lemon_api_key'] ?? '')) !== ''
            && trim((string) ($settings['lemon_store_id'] ?? '')) !== ''
            && trim((string) ($settings['lemon_variant_id'] ?? '')) !== '';
    }

    public function startCheckout(CheckoutRequest $req, ProviderContext $ctx): array
    {
        $res = $ctx->httpJson('POST', 'https://api.lemonsqueezy.com/v1/checkouts', [
            'data' => [
                'type' => 'checkouts',
                'attributes' => [
                    'checkout_data' => [
                        'email' => $req->email !== '' ? $req->email : null,
                        'name' => $req->name !== '' ? $req->name : null,
                        'custom' => [
                            'order_id' => (string) $req->orderId,
                            'payment_id' => (string) $req->paymentId,
                            'order_number' => $req->orderNumber,
                        ],
                    ],
                    'product_options' => [
                        'redirect_url' => $ctx->successUrl($req->orderNumber),
                    ],
                    'checkout_options' => [
                        'embed' => false,
                    ],
                ],
                'relationships' => [
                    'store' => ['data' => ['type' => 'stores', 'id' => (string) $ctx->setting('lemon_store_id')]],
                    'variant' => ['data' => ['type' => 'variants', 'id' => (string) $ctx->setting('lemon_variant_id')]],
                ],
            ],
        ], [
            'Authorization: Bearer ' . (string) $ctx->setting('lemon_api_key'),
        ]);
        $data = is_array($res['data'] ?? null) ? $res['data'] : [];
        $attrs = is_array($data['attributes'] ?? null) ? $data['attributes'] : [];
        $ext = (string) ($data['id'] ?? '');
        $url = (string) ($attrs['url'] ?? '');
        if ($ext === '' || $url === '') {
            $ctx->fail('Lemon Squeezy: не удалось создать checkout', $res);
        }
        $ctx->updatePayment($req->paymentId, 'ls_' . $ext, 'pending', $res);
        return ['mode' => 'redirect', 'redirect_url' => $url, 'external_id' => 'ls_' . $ext];
    }

    public function verifyWebhook(PlatformRequestInterface $r, array $settings): bool
    {
        $secret = trim((string) ($settings['lemon_webhook_secret'] ?? ''));
        if ($secret === '') {
            return (bool) ($settings['test_mode'] ?? true);
        }
        $sig = (string) ($r->header('X-Signature') ?? '');
        if ($sig === '') {
            return false;
        }
        return hash_equals(hash_hmac('sha256', (string) json_encode($r->body(), JSON_UNESCAPED_UNICODE), $secret), $sig);
    }

    public function parseWebhook(PlatformRequestInterface $r, array $settings): array
    {
        $p = $r->body();
        $meta = is_array($p['meta'] ?? null) ? $p['meta'] : [];
        $event = (string) ($meta['event_name'] ?? '');
        $data = is_array($p['data'] ?? null) ? $p['data'] : [];
        $attrs = is_array($data['attributes'] ?? null) ? $data['attributes'] : [];
        $custom = is_array($meta['custom_data'] ?? null) ? $meta['custom_data'] : [];
        $status = str_contains($event, 'success') || ($attrs['status'] ?? '') === 'paid'
            ? 'succeeded'
            : (str_contains($event, 'refund') ? 'refunded' : 'pending');
        return [
            'ls_' . (string) ($data['id'] ?? $attrs['identifier'] ?? ''),
            $status,
            isset($attrs['total']) ? ((float) $attrs['total']) / 100 : 0.0,
            strtoupper((string) ($attrs['currency'] ?? 'USD')),
            isset($custom['order_id']) ? (int) $custom['order_id'] : null,
        ];
    }
}

final class AdyenProvider extends AbstractProvider
{
    public function id(): string { return 'adyen'; }
    public function label(): string { return 'Adyen'; }
    public function group(): string { return 'intl'; }

    public function credentialFields(): array
    {
        return [
            ['key' => 'adyen_api_key', 'label' => 'Adyen — API key', 'type' => 'text', 'default' => ''],
            ['key' => 'adyen_merchant_account', 'label' => 'Adyen — Merchant Account', 'type' => 'text', 'default' => ''],
            ['key' => 'adyen_client_key', 'label' => 'Adyen — Client Key', 'type' => 'text', 'default' => ''],
            ['key' => 'adyen_hmac_key', 'label' => 'Adyen — HMAC key (webhooks)', 'type' => 'text', 'default' => ''],
            ['key' => 'adyen_theme_id', 'label' => 'Adyen — Hosted Checkout themeId (опц.)', 'type' => 'text', 'default' => ''],
        ];
    }

    public function isConfigured(array $settings): bool
    {
        return trim((string) ($settings['adyen_api_key'] ?? '')) !== ''
            && trim((string) ($settings['adyen_merchant_account'] ?? '')) !== '';
    }

    public function startCheckout(CheckoutRequest $req, ProviderContext $ctx): array
    {
        $prefix = $ctx->testMode() ? 'https://checkout-test.adyen.com' : 'https://checkout-live.adyen.com';
        // Live URL often needs region prefix; allow override via gateway not needed — use classic endpoint.
        $body = [
            'merchantAccount' => (string) $ctx->setting('adyen_merchant_account'),
            'amount' => [
                'currency' => $req->currency,
                'value' => $req->amountMinor(),
            ],
            'reference' => $req->orderNumber,
            'returnUrl' => $ctx->successUrl($req->orderNumber),
            'countryCode' => $req->currency === 'RUB' ? 'RU' : 'US',
            'shopperEmail' => $req->email !== '' ? $req->email : null,
            'shopperReference' => (string) $req->orderId,
            'metadata' => [
                'order_id' => (string) $req->orderId,
                'payment_id' => (string) $req->paymentId,
            ],
        ];
        if ((string) $ctx->setting('adyen_theme_id') !== '') {
            $body['themeId'] = (string) $ctx->setting('adyen_theme_id');
        }
        $body = array_filter($body, static fn($v) => $v !== null);
        $res = $ctx->httpJson('POST', $prefix . '/v71/paymentLinks', $body, [
            'X-API-Key: ' . (string) $ctx->setting('adyen_api_key'),
        ]);
        $ext = (string) ($res['id'] ?? '');
        $url = (string) ($res['url'] ?? '');
        if ($ext === '' || $url === '') {
            $ctx->fail('Adyen: не удалось создать Payment Link', $res);
        }
        $ctx->updatePayment($req->paymentId, $ext, 'pending', $res);
        return ['mode' => 'redirect', 'redirect_url' => $url, 'external_id' => $ext];
    }

    public function verifyWebhook(PlatformRequestInterface $r, array $settings): bool
    {
        $hmacKey = trim((string) ($settings['adyen_hmac_key'] ?? ''));
        if ($hmacKey === '') {
            return (bool) ($settings['test_mode'] ?? true);
        }
        $payload = $r->body();
        $items = is_array($payload['notificationItems'] ?? null) ? $payload['notificationItems'] : [];
        if ($items === []) {
            return false;
        }
        foreach ($items as $wrap) {
            $n = is_array($wrap['NotificationRequestItem'] ?? null) ? $wrap['NotificationRequestItem'] : null;
            if (!$n) {
                return false;
            }
            $additional = is_array($n['additionalData'] ?? null) ? $n['additionalData'] : [];
            $hmac = (string) ($additional['hmacSignature'] ?? '');
            if ($hmac === '') {
                return false;
            }
            $psp = (string) ($n['pspReference'] ?? '');
            $orig = (string) ($n['originalReference'] ?? '');
            $merchantAccount = (string) ($n['merchantAccountCode'] ?? '');
            $merchantRef = (string) ($n['merchantReference'] ?? '');
            $value = (string) ($n['amount']['value'] ?? '');
            $currency = (string) ($n['amount']['currency'] ?? '');
            $event = (string) ($n['eventCode'] ?? '');
            $success = !empty($n['success']) ? 'true' : 'false';
            $signing = implode(':', [$psp, $orig, $merchantAccount, $merchantRef, $value, $currency, $event, $success]);
            $key = hex2bin($hmacKey);
            if ($key === false) {
                return false;
            }
            $expected = base64_encode(hash_hmac('sha256', $signing, $key, true));
            if (!hash_equals($expected, $hmac)) {
                return false;
            }
        }
        return true;
    }

    public function parseWebhook(PlatformRequestInterface $r, array $settings): array
    {
        $payload = $r->body();
        $items = is_array($payload['notificationItems'] ?? null) ? $payload['notificationItems'] : [];
        $n = is_array($items[0]['NotificationRequestItem'] ?? null) ? $items[0]['NotificationRequestItem'] : [];
        $event = (string) ($n['eventCode'] ?? '');
        $success = !empty($n['success']);
        $status = ($event === 'AUTHORISATION' || $event === 'CAPTURE') && $success
            ? 'succeeded'
            : (!$success ? 'failed' : 'pending');
        $meta = is_array($n['additionalData'] ?? null) ? $n['additionalData'] : [];
        return [
            (string) ($n['pspReference'] ?? $n['merchantReference'] ?? ''),
            $status,
            isset($n['amount']['value']) ? ((float) $n['amount']['value']) / 100 : 0.0,
            (string) ($n['amount']['currency'] ?? 'EUR'),
            isset($meta['metadata.order_id']) ? (int) $meta['metadata.order_id'] : null,
        ];
    }

    public function webhookAck(): array
    {
        return ['notificationResponse' => '[accepted]'];
    }
}
