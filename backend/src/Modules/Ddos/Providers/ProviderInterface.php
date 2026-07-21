<?php
declare(strict_types=1);

namespace App\Modules\Ddos\Providers;

/**
 * Edge / anti-DDoS provider contract.
 *
 * Providers are toggled independently via enable_{id}. When enabled they:
 *  - trust their real-IP headers (after the peer is verified as their edge)
 *  - optionally enforce origin shield (only edge IPs may hit the origin)
 *  - optionally flip remote "under attack" mode via provider API
 */
interface ProviderInterface
{
    public function id(): string;
    public function label(): string;

    /** @return list<array<string, mixed>> */
    public function credentialFields(): array;

    /** @param array<string, mixed> $settings */
    public function isEnabled(array $settings): bool;

    /** @param array<string, mixed> $settings */
    public function isConfigured(array $settings): bool;

    /**
     * Header names that carry the visitor IP when traffic comes through this edge.
     * @return list<string>
     */
    public function realIpHeaders(): array;

    /**
     * Built-in / custom CIDR allowlist for origin-shield checks.
     * @param array<string, mixed> $settings
     * @return list<string>
     */
    public function edgeCidrs(array $settings): array;

    /**
     * Flip remote under-attack / high-security mode when API credentials exist.
     * @param array<string, mixed> $settings
     * @return array{ok:bool, message:string}
     */
    public function setUnderAttack(bool $enabled, array $settings): array;

    /** @param array<string, mixed> $settings @return array<string, mixed> */
    public function status(array $settings): array;
}

abstract class AbstractProvider implements ProviderInterface
{
    public function isEnabled(array $settings): bool
    {
        return (bool) ($settings['enable_' . $this->id()] ?? false);
    }

    public function setUnderAttack(bool $enabled, array $settings): array
    {
        return [
            'ok' => true,
            'message' => 'Локальный режим «под атакой» ' . ($enabled ? 'включён' : 'выключен')
                . '. Управляйте режимом на стороне ' . $this->label() . ' в их кабинете (API не настроен).',
        ];
    }

    public function status(array $settings): array
    {
        return [
            'id' => $this->id(),
            'label' => $this->label(),
            'enabled' => $this->isEnabled($settings),
            'configured' => $this->isConfigured($settings),
            'enforce_edge' => (bool) ($settings[$this->id() . '_enforce_edge'] ?? false),
            'cidrs' => count($this->edgeCidrs($settings)),
        ];
    }

    /** @param list<string> $extra @return list<string> */
    protected function mergeCidrs(array $settings, array $builtin, string $extraKey): array
    {
        $extra = (string) ($settings[$extraKey] ?? '');
        $lines = preg_split('/[\s,;]+/', $extra) ?: [];
        $out = $builtin;
        foreach ($lines as $line) {
            $line = trim($line);
            if ($line !== '' && (str_contains($line, '/') || filter_var($line, FILTER_VALIDATE_IP))) {
                $out[] = $line;
            }
        }
        return array_values(array_unique($out));
    }

    /** @param list<string> $headers @return array<string, mixed> */
    protected function httpJson(string $method, string $url, ?array $body, array $headers): array
    {
        $headers[] = 'Content-Type: application/json';
        $headers[] = 'Accept: application/json';
        $payload = $body !== null ? (json_encode($body, JSON_UNESCAPED_UNICODE) ?: '{}') : '';
        if (function_exists('curl_init')) {
            $ch = curl_init($url);
            curl_setopt_array($ch, [
                CURLOPT_CUSTOMREQUEST => $method,
                CURLOPT_RETURNTRANSFER => true,
                CURLOPT_HTTPHEADER => $headers,
                CURLOPT_POSTFIELDS => $method === 'GET' ? null : $payload,
                CURLOPT_TIMEOUT => 25,
            ]);
            $raw = curl_exec($ch);
            $code = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
            curl_close($ch);
            $decoded = json_decode((string) $raw, true);
            return is_array($decoded) ? $decoded + ['_http' => $code] : ['_raw' => (string) $raw, '_http' => $code];
        }
        return ['_http' => 0, '_raw' => ''];
    }
}
