<?php
declare(strict_types=1);

namespace App\Modules\Payments\Providers;

use App\Request;

/** Т-Касса (T-Bank / Tinkoff Acquiring v2) */
final class TKassaProvider extends AbstractProvider
{
    public function id(): string { return 'tkassa'; }
    public function label(): string { return 'Т-Касса'; }
    public function group(): string { return 'ru'; }

    public function credentialFields(): array
    {
        return [
            ['key' => 'tkassa_terminal_key', 'label' => 'Т-Касса — TerminalKey', 'type' => 'text', 'default' => ''],
            ['key' => 'tkassa_password', 'label' => 'Т-Касса — пароль терминала', 'type' => 'text', 'default' => ''],
        ];
    }

    public function isConfigured(array $settings): bool
    {
        return trim((string) ($settings['tkassa_terminal_key'] ?? '')) !== ''
            && trim((string) ($settings['tkassa_password'] ?? '')) !== '';
    }

    public function startCheckout(CheckoutRequest $req, ProviderContext $ctx): array
    {
        $payload = [
            'TerminalKey' => (string) $ctx->setting('tkassa_terminal_key'),
            'Amount' => $req->amountMinor(),
            'OrderId' => $req->orderNumber,
            'Description' => mb_substr($req->description, 0, 250),
            'SuccessURL' => $ctx->successUrl($req->orderNumber),
            'FailURL' => $ctx->failUrl($req->orderNumber),
            'NotificationURL' => $ctx->webhookUrl($this->id()),
            'DATA' => [
                'order_id' => (string) $req->orderId,
                'payment_id' => (string) $req->paymentId,
            ],
        ];
        if ($req->email !== '') {
            $payload['Receipt'] = [
                'Email' => $req->email,
                'Taxation' => 'usn_income',
                'Items' => [[
                    'Name' => mb_substr($req->description, 0, 128),
                    'Price' => $req->amountMinor(),
                    'Quantity' => 1,
                    'Amount' => $req->amountMinor(),
                    'Tax' => 'none',
                    'PaymentMethod' => 'full_payment',
                    'PaymentObject' => 'service',
                ]],
            ];
        }
        $payload['Token'] = self::token($payload, (string) $ctx->setting('tkassa_password'));
        $res = $ctx->httpJson('POST', 'https://securepay.tinkoff.ru/v2/Init', $payload);
        if (empty($res['Success']) || empty($res['PaymentURL'])) {
            $ctx->fail('Т-Касса Init не удался: ' . (string) ($res['Message'] ?? $res['Details'] ?? 'unknown'), $res);
        }
        $ext = (string) ($res['PaymentId'] ?? '');
        $ctx->updatePayment($req->paymentId, $ext, 'pending', $res);
        return ['mode' => 'redirect', 'redirect_url' => (string) $res['PaymentURL'], 'external_id' => $ext];
    }

    public function verifyWebhook(Request $r, array $settings): bool
    {
        $password = (string) ($settings['tkassa_password'] ?? '');
        $payload = $r->all();
        if ($password === '' || empty($payload['Token'])) {
            return false;
        }
        $token = (string) $payload['Token'];
        unset($payload['Token']);
        return hash_equals(self::token($payload, $password), $token);
    }

    public function parseWebhook(Request $r, array $settings): array
    {
        $p = $r->all();
        $statusRaw = strtoupper((string) ($p['Status'] ?? ''));
        $status = match ($statusRaw) {
            'CONFIRMED', 'AUTHORIZED' => 'succeeded',
            'REJECTED', 'CANCELED', 'DEADLINE_EXPIRED', 'REVERSED' => 'failed',
            'REFUNDED', 'PARTIAL_REFUNDED' => 'refunded',
            default => 'pending',
        };
        $data = is_array($p['DATA'] ?? null) ? $p['DATA'] : [];
        return [
            (string) ($p['PaymentId'] ?? ''),
            $status,
            isset($p['Amount']) ? ((float) $p['Amount']) / 100 : 0.0,
            'RUB',
            isset($data['order_id']) ? (int) $data['order_id'] : null,
        ];
    }

    /** @param array<string, mixed> $payload */
    public static function token(array $payload, string $password): string
    {
        $flat = ['Password' => $password];
        foreach ($payload as $k => $v) {
            if ($k === 'Token' || $k === 'Receipt' || $k === 'DATA' || is_array($v)) {
                continue;
            }
            $flat[$k] = is_bool($v) ? ($v ? 'true' : 'false') : (string) $v;
        }
        ksort($flat);
        return hash('sha256', implode('', array_values($flat)));
    }
}

/** Robokassa — payment URL with MD5 signature */
final class RobokassaProvider extends AbstractProvider
{
    public function id(): string { return 'robokassa'; }
    public function label(): string { return 'Robokassa'; }
    public function group(): string { return 'ru'; }

    public function credentialFields(): array
    {
        return [
            ['key' => 'robokassa_login', 'label' => 'Robokassa — логин магазина', 'type' => 'text', 'default' => ''],
            ['key' => 'robokassa_pass1', 'label' => 'Robokassa — пароль #1', 'type' => 'text', 'default' => ''],
            ['key' => 'robokassa_pass2', 'label' => 'Robokassa — пароль #2', 'type' => 'text', 'default' => ''],
        ];
    }

    public function isConfigured(array $settings): bool
    {
        return trim((string) ($settings['robokassa_login'] ?? '')) !== ''
            && trim((string) ($settings['robokassa_pass1'] ?? '')) !== ''
            && trim((string) ($settings['robokassa_pass2'] ?? '')) !== '';
    }

    public function startCheckout(CheckoutRequest $req, ProviderContext $ctx): array
    {
        $login = (string) $ctx->setting('robokassa_login');
        $pass1 = (string) $ctx->setting('robokassa_pass1');
        $outSum = $req->amountFixed();
        $invId = (string) $req->paymentId;
        $desc = mb_substr($req->description, 0, 100);
        $sig = md5("$login:$outSum:$invId:$pass1");
        $base = $ctx->testMode()
            ? 'https://auth.robokassa.ru/Merchant/Index.aspx'
            : 'https://auth.robokassa.ru/Merchant/Index.aspx';
        $qs = http_build_query([
            'MerchantLogin' => $login,
            'OutSum' => $outSum,
            'InvId' => $invId,
            'Description' => $desc,
            'SignatureValue' => $sig,
            'Culture' => 'ru',
            'Encoding' => 'utf-8',
            'IsTest' => $ctx->testMode() ? 1 : 0,
            'SuccessURL' => $ctx->successUrl($req->orderNumber),
            'FailURL' => $ctx->failUrl($req->orderNumber),
            'ResultURL' => $ctx->webhookUrl($this->id()),
            'Shp_order' => $req->orderId,
        ]);
        // Signature with custom shp_ params: login:outsum:invid:pass1:Shp_order=…
        $sig2 = md5("$login:$outSum:$invId:$pass1:Shp_order={$req->orderId}");
        $qs = http_build_query([
            'MerchantLogin' => $login,
            'OutSum' => $outSum,
            'InvId' => $invId,
            'Description' => $desc,
            'SignatureValue' => $sig2,
            'Culture' => 'ru',
            'Encoding' => 'utf-8',
            'IsTest' => $ctx->testMode() ? 1 : 0,
            'Shp_order' => $req->orderId,
        ]);
        $ctx->updatePayment($req->paymentId, 'rk_' . $invId, 'pending', ['url' => "$base?$qs"]);
        return ['mode' => 'redirect', 'redirect_url' => "$base?$qs", 'external_id' => 'rk_' . $invId];
    }

    public function verifyWebhook(Request $r, array $settings): bool
    {
        $pass2 = (string) ($settings['robokassa_pass2'] ?? '');
        $outSum = (string) ($r->input('OutSum') ?? '');
        $invId = (string) ($r->input('InvId') ?? '');
        $sig = strtoupper((string) ($r->input('SignatureValue') ?? ''));
        $shp = (string) ($r->input('Shp_order') ?? '');
        if ($pass2 === '' || $outSum === '' || $invId === '') {
            return false;
        }
        $expected = $shp !== ''
            ? strtoupper(md5("$outSum:$invId:$pass2:Shp_order=$shp"))
            : strtoupper(md5("$outSum:$invId:$pass2"));
        return hash_equals($expected, $sig);
    }

    public function parseWebhook(Request $r, array $settings): array
    {
        $invId = (string) ($r->input('InvId') ?? '');
        $orderId = $r->input('Shp_order');
        return [
            'rk_' . $invId,
            'succeeded',
            (float) ($r->input('OutSum') ?? 0),
            'RUB',
            $orderId !== null && $orderId !== '' ? (int) $orderId : null,
        ];
    }

    public function webhookAck(): array
    {
        // Robokassa expects plain text OK{InvId}
        return ['ok' => true, 'robokassa' => true];
    }
}

final class UnitPayProvider extends AbstractProvider
{
    public function id(): string { return 'unitpay'; }
    public function label(): string { return 'UnitPay'; }
    public function group(): string { return 'ru'; }

    public function credentialFields(): array
    {
        return [
            ['key' => 'unitpay_public_key', 'label' => 'UnitPay — public key (project)', 'type' => 'text', 'default' => ''],
            ['key' => 'unitpay_secret_key', 'label' => 'UnitPay — secret key', 'type' => 'text', 'default' => ''],
        ];
    }

    public function isConfigured(array $settings): bool
    {
        return trim((string) ($settings['unitpay_public_key'] ?? '')) !== ''
            && trim((string) ($settings['unitpay_secret_key'] ?? '')) !== '';
    }

    public function startCheckout(CheckoutRequest $req, ProviderContext $ctx): array
    {
        $public = (string) $ctx->setting('unitpay_public_key');
        $secret = (string) $ctx->setting('unitpay_secret_key');
        $sum = $req->amountFixed();
        $account = $req->orderNumber;
        $desc = mb_substr($req->description, 0, 128);
        $currency = $req->currency;
        $sig = hash('sha256', $account . '{up}' . $currency . '{up}' . $desc . '{up}' . $sum . '{up}' . $secret);
        $url = 'https://unitpay.ru/pay/' . rawurlencode($public) . '?' . http_build_query([
            'sum' => $sum,
            'account' => $account,
            'desc' => $desc,
            'currency' => $currency,
            'signature' => $sig,
            'customerEmail' => $req->email,
            'resultUrl' => $ctx->webhookUrl($this->id()),
            'successUrl' => $ctx->successUrl($req->orderNumber),
            'failUrl' => $ctx->failUrl($req->orderNumber),
        ]);
        $ctx->updatePayment($req->paymentId, 'up_' . $account, 'pending', ['url' => $url]);
        return ['mode' => 'redirect', 'redirect_url' => $url, 'external_id' => 'up_' . $account];
    }

    public function verifyWebhook(Request $r, array $settings): bool
    {
        $secret = (string) ($settings['unitpay_secret_key'] ?? '');
        $method = (string) ($r->query('method') ?? $r->input('method') ?? '');
        $params = $r->input('params');
        if (!is_array($params)) {
            $params = $r->all();
        }
        $sig = (string) ($params['signature'] ?? '');
        if ($secret === '' || $sig === '') {
            return false;
        }
        ksort($params);
        unset($params['signature']);
        $parts = [$method];
        foreach ($params as $v) {
            $parts[] = (string) $v;
        }
        $parts[] = $secret;
        return hash_equals(hash('sha256', implode('{up}', $parts)), $sig);
    }

    public function parseWebhook(Request $r, array $settings): array
    {
        $method = (string) ($r->query('method') ?? $r->input('method') ?? '');
        $params = is_array($r->input('params')) ? $r->input('params') : $r->all();
        $status = match ($method) {
            'pay' => 'succeeded',
            'error' => 'failed',
            default => 'pending',
        };
        return [
            'up_' . (string) ($params['account'] ?? $params['unitpayId'] ?? ''),
            $status,
            (float) ($params['orderSum'] ?? $params['sum'] ?? 0),
            (string) ($params['orderCurrency'] ?? $params['currency'] ?? 'RUB'),
            null,
        ];
    }

    public function webhookAck(): array
    {
        return ['result' => ['message' => 'OK']];
    }
}

final class PayAnyWayProvider extends AbstractProvider
{
    public function id(): string { return 'payanyway'; }
    public function label(): string { return 'PayAnyWay'; }
    public function group(): string { return 'ru'; }

    public function credentialFields(): array
    {
        return [
            ['key' => 'payanyway_account', 'label' => 'PayAnyWay — номер счёта (MNT_ID)', 'type' => 'text', 'default' => ''],
            ['key' => 'payanyway_code', 'label' => 'PayAnyWay — код проверки целостности', 'type' => 'text', 'default' => ''],
        ];
    }

    public function isConfigured(array $settings): bool
    {
        return trim((string) ($settings['payanyway_account'] ?? '')) !== ''
            && trim((string) ($settings['payanyway_code'] ?? '')) !== '';
    }

    public function startCheckout(CheckoutRequest $req, ProviderContext $ctx): array
    {
        $mntId = (string) $ctx->setting('payanyway_account');
        $code = (string) $ctx->setting('payanyway_code');
        $amount = $req->amountFixed();
        $txn = $req->orderNumber;
        $currency = $req->currency === 'RUB' ? 'RUB' : $req->currency;
        $test = $ctx->testMode() ? '1' : '0';
        // MNT_SIGNATURE = MD5(MNT_ID + MNT_TRANSACTION_ID + MNT_AMOUNT + MNT_CURRENCY_CODE + MNT_TEST_MODE + CODE)
        $sig = md5($mntId . $txn . $amount . $currency . $test . $code);
        $url = 'https://www.payanyway.ru/assistant.htm?' . http_build_query([
            'MNT_ID' => $mntId,
            'MNT_TRANSACTION_ID' => $txn,
            'MNT_AMOUNT' => $amount,
            'MNT_CURRENCY_CODE' => $currency,
            'MNT_TEST_MODE' => $test,
            'MNT_DESCRIPTION' => mb_substr($req->description, 0, 200),
            'MNT_SIGNATURE' => $sig,
            'MNT_SUCCESS_URL' => $ctx->successUrl($req->orderNumber),
            'MNT_FAIL_URL' => $ctx->failUrl($req->orderNumber),
            'MNT_RETURN_URL' => $ctx->successUrl($req->orderNumber),
            'MNT_CUSTOM1' => (string) $req->orderId,
            'MNT_CUSTOM2' => (string) $req->paymentId,
        ]);
        $ctx->updatePayment($req->paymentId, 'paw_' . $txn, 'pending', ['url' => $url]);
        return ['mode' => 'redirect', 'redirect_url' => $url, 'external_id' => 'paw_' . $txn];
    }

    public function verifyWebhook(Request $r, array $settings): bool
    {
        $code = (string) ($settings['payanyway_code'] ?? '');
        $mntId = (string) ($r->input('MNT_ID') ?? '');
        $txn = (string) ($r->input('MNT_TRANSACTION_ID') ?? '');
        $opId = (string) ($r->input('MNT_OPERATION_ID') ?? '');
        $amount = (string) ($r->input('MNT_AMOUNT') ?? '');
        $currency = (string) ($r->input('MNT_CURRENCY_CODE') ?? '');
        $test = (string) ($r->input('MNT_TEST_MODE') ?? '0');
        $sig = (string) ($r->input('MNT_SIGNATURE') ?? '');
        if ($code === '') {
            return false;
        }
        $expected = md5($mntId . $txn . $opId . $amount . $currency . $test . $code);
        return hash_equals(strtolower($expected), strtolower($sig));
    }

    public function parseWebhook(Request $r, array $settings): array
    {
        return [
            'paw_' . (string) ($r->input('MNT_TRANSACTION_ID') ?? ''),
            'succeeded',
            (float) ($r->input('MNT_AMOUNT') ?? 0),
            (string) ($r->input('MNT_CURRENCY_CODE') ?? 'RUB'),
            ($r->input('MNT_CUSTOM1') ?? '') !== '' ? (int) $r->input('MNT_CUSTOM1') : null,
        ];
    }
}

/**
 * RBS-compatible internet acquiring (Sber / Alfa / VTB / Gazprombank / UBRiR).
 * Uses register.do + getOrderStatusExtended.do payment/rest API.
 */
abstract class RbsBankProvider extends AbstractProvider
{
    abstract protected function defaultGateway(): string;
    abstract protected function prefix(): string;

    public function group(): string { return 'ru'; }

    public function credentialFields(): array
    {
        $id = $this->id();
        $label = $this->label();
        return [
            ['key' => "{$id}_user", 'label' => "$label — логин API", 'type' => 'text', 'default' => ''],
            ['key' => "{$id}_password", 'label' => "$label — пароль API", 'type' => 'text', 'default' => ''],
            ['key' => "{$id}_gateway", 'label' => "$label — URL шлюза", 'type' => 'url', 'default' => $this->defaultGateway(),
                'help' => 'Обычно …/payment/rest/ (из договора банка)'],
        ];
    }

    public function isConfigured(array $settings): bool
    {
        $id = $this->id();
        return trim((string) ($settings["{$id}_user"] ?? '')) !== ''
            && trim((string) ($settings["{$id}_password"] ?? '')) !== '';
    }

    public function startCheckout(CheckoutRequest $req, ProviderContext $ctx): array
    {
        $id = $this->id();
        $base = rtrim((string) ($ctx->setting("{$id}_gateway") ?: $this->defaultGateway()), '/') . '/';
        $res = $ctx->httpForm('POST', $base . 'register.do', [
            'userName' => (string) $ctx->setting("{$id}_user"),
            'password' => (string) $ctx->setting("{$id}_password"),
            'orderNumber' => $req->orderNumber,
            'amount' => $req->amountMinor(),
            'currency' => $this->currencyCode($req->currency),
            'returnUrl' => $ctx->successUrl($req->orderNumber),
            'failUrl' => $ctx->failUrl($req->orderNumber),
            'description' => mb_substr($req->description, 0, 512),
            'jsonParams' => json_encode([
                'order_id' => $req->orderId,
                'payment_id' => $req->paymentId,
            ], JSON_UNESCAPED_UNICODE),
        ]);
        $formUrl = (string) ($res['formUrl'] ?? '');
        $orderId = (string) ($res['orderId'] ?? '');
        if ($formUrl === '' || $orderId === '') {
            $ctx->fail($this->label() . ': ошибка register.do — ' . (string) ($res['errorMessage'] ?? 'unknown'), $res);
        }
        $ext = $this->prefix() . $orderId;
        $ctx->updatePayment($req->paymentId, $ext, 'pending', $res);
        return ['mode' => 'redirect', 'redirect_url' => $formUrl, 'external_id' => $ext];
    }

    public function verifyWebhook(Request $r, array $settings): bool
    {
        // RBS callbacks are typically server-to-server without HMAC; optional shared token.
        $token = trim((string) ($settings['webhook_secret'] ?? ''));
        if ($token === '') {
            return true;
        }
        $provided = (string) ($r->query('token') ?? $r->header('X-Webhook-Token') ?? '');
        return $provided !== '' && hash_equals($token, $provided);
    }

    public function parseWebhook(Request $r, array $settings): array
    {
        $p = $r->all();
        $orderId = (string) ($p['mdOrder'] ?? $p['orderId'] ?? $p['orderNumber'] ?? '');
        $status = (string) ($p['status'] ?? $p['operation'] ?? '');
        $ok = in_array($status, ['1', '2', 'deposited', 'approved', 'paid'], true)
            || (string) ($p['operation'] ?? '') === 'deposited';
        return [
            $this->prefix() . $orderId,
            $ok ? 'succeeded' : 'pending',
            isset($p['amount']) ? ((float) $p['amount']) / 100 : 0.0,
            'RUB',
            null,
        ];
    }

    private function currencyCode(string $currency): string
    {
        return match (strtoupper($currency)) {
            'USD' => '840',
            'EUR' => '978',
            'RUB', 'RUR' => '643',
            default => '643',
        };
    }
}

final class SberbankProvider extends RbsBankProvider
{
    public function id(): string { return 'sberbank'; }
    public function label(): string { return 'СберБанк Интернет-эквайринг'; }
    protected function defaultGateway(): string { return 'https://securepayments.sberbank.ru/payment/rest'; }
    protected function prefix(): string { return 'sber_'; }
}

final class AlfaBankProvider extends RbsBankProvider
{
    public function id(): string { return 'alfabank'; }
    public function label(): string { return 'Альфа-Банк'; }
    protected function defaultGateway(): string { return 'https://payment.alfabank.ru/payment/rest'; }
    protected function prefix(): string { return 'alfa_'; }
}

final class VtbProvider extends RbsBankProvider
{
    public function id(): string { return 'vtb'; }
    public function label(): string { return 'ВТБ'; }
    protected function defaultGateway(): string { return 'https://vtb.rbsuat.com/payment/rest'; }
    protected function prefix(): string { return 'vtb_'; }
}

final class GazprombankProvider extends RbsBankProvider
{
    public function id(): string { return 'gazprombank'; }
    public function label(): string { return 'Газпромбанк Интернет-эквайринг'; }
    protected function defaultGateway(): string { return 'https://www.gtpay.ru/payment/rest'; }
    protected function prefix(): string { return 'gpb_'; }
}

final class UbrirProvider extends RbsBankProvider
{
    public function id(): string { return 'ubrir'; }
    public function label(): string { return 'УБРиР'; }
    protected function defaultGateway(): string { return 'https://pay.ubrr.ru/payment/rest'; }
    protected function prefix(): string { return 'ubrir_'; }
}

/** Точка Банк — acquiring API (JWT / API token) */
final class TochkaProvider extends AbstractProvider
{
    public function id(): string { return 'tochka'; }
    public function label(): string { return 'Точка'; }
    public function group(): string { return 'ru'; }

    public function credentialFields(): array
    {
        return [
            ['key' => 'tochka_jwt', 'label' => 'Точка — JWT / access token', 'type' => 'text', 'default' => '',
                'help' => 'Токен из кабинета Точки (Acquiring API)'],
            ['key' => 'tochka_customer_code', 'label' => 'Точка — customerCode', 'type' => 'text', 'default' => ''],
            ['key' => 'tochka_merchant_id', 'label' => 'Точка — merchantId', 'type' => 'text', 'default' => ''],
        ];
    }

    public function isConfigured(array $settings): bool
    {
        return trim((string) ($settings['tochka_jwt'] ?? '')) !== ''
            && trim((string) ($settings['tochka_customer_code'] ?? '')) !== '';
    }

    public function startCheckout(CheckoutRequest $req, ProviderContext $ctx): array
    {
        $customer = rawurlencode((string) $ctx->setting('tochka_customer_code'));
        $body = [
            'Data' => [
                'amount' => $req->amountFixed(),
                'currency' => $req->currency,
                'purpose' => mb_substr($req->description, 0, 210),
                'paymentMode' => ['sbp', 'card'],
                'consumerId' => $req->orderNumber,
                'redirectUrl' => $ctx->successUrl($req->orderNumber),
                'failRedirectUrl' => $ctx->failUrl($req->orderNumber),
                'ttl' => 60,
            ],
        ];
        if ((string) $ctx->setting('tochka_merchant_id') !== '') {
            $body['Data']['merchantId'] = (string) $ctx->setting('tochka_merchant_id');
        }
        $res = $ctx->httpJson(
            'POST',
            "https://enter.tochka.com/uapi/acquiring/v1.0/payments_with_receipt?customerCode={$customer}",
            $body,
            ['Authorization: Bearer ' . (string) $ctx->setting('tochka_jwt')],
        );
        $data = is_array($res['Data'] ?? null) ? $res['Data'] : $res;
        $ext = (string) ($data['operationId'] ?? $data['paymentId'] ?? $data['id'] ?? '');
        $url = (string) ($data['paymentLink'] ?? $data['paymentUrl'] ?? $data['url'] ?? '');
        if ($ext === '' || $url === '') {
            $ctx->fail('Точка: не удалось создать платёж', $res);
        }
        $ctx->updatePayment($req->paymentId, 'tochka_' . $ext, 'pending', $res);
        return ['mode' => 'redirect', 'redirect_url' => $url, 'external_id' => 'tochka_' . $ext];
    }

    public function parseWebhook(Request $r, array $settings): array
    {
        $p = $r->all();
        $data = is_array($p['Data'] ?? null) ? $p['Data'] : $p;
        $statusRaw = strtolower((string) ($data['status'] ?? $p['status'] ?? ''));
        $ok = in_array($statusRaw, ['approved', 'completed', 'paid', 'success'], true);
        return [
            'tochka_' . (string) ($data['operationId'] ?? $data['paymentId'] ?? $data['id'] ?? ''),
            $ok ? 'succeeded' : (in_array($statusRaw, ['rejected', 'cancelled', 'failed'], true) ? 'failed' : 'pending'),
            (float) ($data['amount'] ?? 0),
            (string) ($data['currency'] ?? 'RUB'),
            null,
        ];
    }
}
