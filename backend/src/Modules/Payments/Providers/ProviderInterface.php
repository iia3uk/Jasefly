<?php
declare(strict_types=1);

namespace App\Modules\Payments\Providers;

use App\Core\Container;
use App\Database;
use App\Request;
use App\Response;
use App\Support\PublicOrigin;

/** Shared checkout payload passed to every provider. */
final class CheckoutRequest
{
    public function __construct(
        public int $paymentId,
        public int $orderId,
        public string $orderNumber,
        public float $amount,
        public string $currency,
        public string $description,
        public string $email,
        public string $name,
    ) {}

    public function amountMinor(): int
    {
        return (int) round($this->amount * 100);
    }

    public function amountFixed(int $decimals = 2): string
    {
        return number_format($this->amount, $decimals, '.', '');
    }
}

/**
 * Runtime helpers for providers (URLs, HTTP, payment row updates).
 *
 * @phpstan-type Settings array<string, mixed>
 */
final class ProviderContext
{
    /** @param Settings $settings */
    public function __construct(
        private Database $db,
        private array $settings,
        private string $apiPrefix = '/api/v1',
    ) {}

    /** @return Settings */
    public function settings(): array
    {
        return $this->settings;
    }

    public function setting(string $key, mixed $default = ''): mixed
    {
        return $this->settings[$key] ?? $default;
    }

    public function testMode(): bool
    {
        return (bool) ($this->settings['test_mode'] ?? true);
    }

    public function successUrl(string $orderNumber = ''): string
    {
        $url = $this->absolute((string) ($this->settings['success_url'] ?? '/payment-success'));
        if ($orderNumber !== '') {
            $url .= (str_contains($url, '?') ? '&' : '?') . 'order=' . urlencode($orderNumber);
        }
        return $url;
    }

    public function failUrl(string $orderNumber = ''): string
    {
        $url = $this->absolute((string) ($this->settings['fail_url'] ?? '/payment-fail'));
        if ($orderNumber !== '') {
            $url .= (str_contains($url, '?') ? '&' : '?') . 'order=' . urlencode($orderNumber);
        }
        return $url;
    }

    public function webhookUrl(string $provider): string
    {
        $path = rtrim($this->apiPrefix, '/') . '/payments/webhook?provider=' . urlencode($provider);
        return $this->absolute($path);
    }

    public function absolute(string $path): string
    {
        if (preg_match('#^https?://#i', $path)) {
            return $path;
        }
        $app = [];
        try {
            if (Container::getInstance()->has('app')) {
                $cfg = Container::getInstance()->get('app');
                if (is_array($cfg)) {
                    $app = $cfg;
                }
            }
        } catch (\Throwable) {
        }
        $origin = PublicOrigin::resolve($this->db, $app);
        if ($origin === '') {
            // Last resort for misconfigured shared hosting — never trust raw Host blindly.
            $origin = PublicOrigin::fallbackFromRequest($app);
        }
        if ($origin === '') {
            $origin = 'http://localhost';
        }
        return rtrim($origin, '/') . '/' . ltrim($path, '/');
    }

    public function updatePayment(int $paymentId, string $externalId, string $status, mixed $payload = null): void
    {
        $this->db->run(
            'UPDATE payments SET external_id = ?, status = ?, raw_payload = ? WHERE id = ?',
            [
                $externalId,
                $status,
                is_string($payload) ? $payload : json_encode($payload, JSON_UNESCAPED_UNICODE),
                $paymentId,
            ],
        );
    }

    /** @param list<string> $headers @return array<string, mixed> */
    public function httpJson(string $method, string $url, array $body, array $headers = []): array
    {
        $headers[] = 'Content-Type: application/json';
        $headers[] = 'Accept: application/json';
        return $this->http($method, $url, json_encode($body, JSON_UNESCAPED_UNICODE) ?: '{}', $headers);
    }

    /**
     * @param array<string, scalar|null> $fields
     * @param list<string> $headers
     * @return array<string, mixed>
     */
    public function httpForm(string $method, string $url, array $fields, array $headers = []): array
    {
        $headers[] = 'Content-Type: application/x-www-form-urlencoded';
        $headers[] = 'Accept: application/json';
        return $this->http($method, $url, http_build_query($fields), $headers);
    }

    /** @param list<string> $headers @return array<string, mixed> */
    public function http(string $method, string $url, string $body, array $headers): array
    {
        if (function_exists('curl_init')) {
            $ch = curl_init($url);
            curl_setopt_array($ch, [
                CURLOPT_CUSTOMREQUEST => $method,
                CURLOPT_RETURNTRANSFER => true,
                CURLOPT_HTTPHEADER => $headers,
                CURLOPT_POSTFIELDS => $method === 'GET' ? null : $body,
                CURLOPT_TIMEOUT => 45,
            ]);
            $raw = curl_exec($ch);
            $code = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
            $err = curl_error($ch);
            curl_close($ch);
            if ($raw === false) {
                Response::json(['success' => false, 'error' => 'HTTP error: ' . $err], 502);
            }
            $decoded = json_decode((string) $raw, true);
            if (!is_array($decoded)) {
                return ['_raw' => (string) $raw, '_http' => $code];
            }
            $decoded['_http'] = $code;
            return $decoded;
        }

        $ctx = stream_context_create([
            'http' => [
                'method' => $method,
                'header' => implode("\r\n", $headers),
                'content' => $method === 'GET' ? '' : $body,
                'timeout' => 45,
                'ignore_errors' => true,
            ],
        ]);
        $raw = @file_get_contents($url, false, $ctx);
        $decoded = json_decode((string) $raw, true);
        return is_array($decoded) ? $decoded : ['_raw' => (string) $raw];
    }

    public function fail(string $message, mixed $details = null): never
    {
        $payload = ['success' => false, 'error' => $message];
        if ($details !== null) {
            $payload['details'] = $details;
        }
        Response::json($payload, 502);
    }
}

interface ProviderInterface
{
    public function id(): string;
    public function label(): string;
    /** ru | intl | other */
    public function group(): string;

    /**
     * Credential / config fields (enable_* is injected by catalog).
     * @return list<array<string, mixed>>
     */
    public function credentialFields(): array;

    /** @param array<string, mixed> $settings */
    public function isEnabled(array $settings): bool;

    /** @param array<string, mixed> $settings */
    public function isConfigured(array $settings): bool;

    /** @return array<string, mixed> checkout result (mode/redirect_url/widget/…) */
    public function startCheckout(CheckoutRequest $req, ProviderContext $ctx): array;

    /** @param array<string, mixed> $settings */
    public function verifyWebhook(Request $r, array $settings): bool;

    /**
     * @param array<string, mixed> $settings
     * @return array{0:string,1:string,2:float,3:string,4:?int} externalId, status, amount, currency, orderId
     */
    public function parseWebhook(Request $r, array $settings): array;

    /** @return array<string, mixed> */
    public function webhookAck(): array;
}

abstract class AbstractProvider implements ProviderInterface
{
    public function group(): string
    {
        return 'other';
    }

    public function isEnabled(array $settings): bool
    {
        $key = 'enable_' . $this->id();
        if (!array_key_exists($key, $settings)) {
            // Default-on only for manual; others opt-in.
            return $this->id() === 'manual';
        }
        return (bool) $settings[$key];
    }

    public function webhookAck(): array
    {
        return ['ok' => true];
    }

    public function verifyWebhook(Request $r, array $settings): bool
    {
        return true;
    }

    public function parseWebhook(Request $r, array $settings): array
    {
        $p = $r->all();
        return [
            (string) ($p['id'] ?? $p['payment_id'] ?? ''),
            (string) ($p['status'] ?? 'pending'),
            (float) ($p['amount'] ?? 0),
            (string) ($p['currency'] ?? 'RUB'),
            isset($p['order_id']) ? (int) $p['order_id'] : null,
        ];
    }

    protected function enabledFlagSchema(): array
    {
        return [
            'key' => 'enable_' . $this->id(),
            'label' => 'Включить: ' . $this->label(),
            'type' => 'checkbox',
            'default' => $this->id() === 'manual',
            'help' => 'Показывать этот способ оплаты на сайте (после заполнения ключей)',
        ];
    }
}
