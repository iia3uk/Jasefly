<?php
declare(strict_types=1);

namespace App\Modules\Ddos\Providers;

final class CloudflareProvider extends AbstractProvider
{
    public function id(): string { return 'cloudflare'; }
    public function label(): string { return 'Cloudflare'; }

    public function credentialFields(): array
    {
        return [
            ['key' => 'cloudflare_enforce_edge', 'label' => 'Cloudflare — только трафик с edge (origin shield)', 'type' => 'checkbox', 'default' => false,
                'help' => 'Блокировать прямые обращения к origin вне IP Cloudflare'],
            ['key' => 'cloudflare_api_token', 'label' => 'Cloudflare — API Token', 'type' => 'text', 'default' => '',
                'help' => 'Zone.Settings:Edit для переключения Under Attack Mode'],
            ['key' => 'cloudflare_zone_id', 'label' => 'Cloudflare — Zone ID', 'type' => 'text', 'default' => ''],
            ['key' => 'cloudflare_extra_cidrs', 'label' => 'Cloudflare — доп. CIDR', 'type' => 'textarea', 'default' => ''],
        ];
    }

    public function isConfigured(array $settings): bool
    {
        // Usable without API (header trust + optional edge CIDR). API needed only for remote under-attack.
        return true;
    }

    public function realIpHeaders(): array
    {
        return ['CF-Connecting-IP', 'True-Client-IP'];
    }

    public function edgeCidrs(array $settings): array
    {
        // Snapshot of Cloudflare published ranges (refresh via admin "sync ranges").
        $builtin = [
            '173.245.48.0/20', '103.21.244.0/22', '103.22.200.0/22', '103.31.4.0/22',
            '141.101.64.0/18', '108.162.192.0/18', '190.93.240.0/20', '188.114.96.0/20',
            '197.234.240.0/22', '198.41.128.0/17', '162.158.0.0/15', '104.16.0.0/13',
            '104.24.0.0/14', '172.64.0.0/13', '131.0.72.0/22',
            '2400:cb00::/32', '2606:4700::/32', '2803:f800::/32', '2405:b500::/32',
            '2405:8100::/32', '2a06:98c0::/29', '2c0f:f248::/32',
        ];
        $cached = $settings['_cloudflare_cidrs_cache'] ?? null;
        if (is_array($cached) && $cached !== []) {
            $builtin = $cached;
        }
        return $this->mergeCidrs($settings, $builtin, 'cloudflare_extra_cidrs');
    }

    public function setUnderAttack(bool $enabled, array $settings): array
    {
        $token = trim((string) ($settings['cloudflare_api_token'] ?? ''));
        $zone = trim((string) ($settings['cloudflare_zone_id'] ?? ''));
        if ($token === '' || $zone === '') {
            return parent::setUnderAttack($enabled, $settings);
        }
        $value = $enabled ? 'under_attack' : 'high';
        $res = $this->httpJson(
            'PATCH',
            "https://api.cloudflare.com/client/v4/zones/{$zone}/settings/security_level",
            ['value' => $value],
            ['Authorization: Bearer ' . $token],
        );
        $ok = !empty($res['success']);
        return [
            'ok' => $ok,
            'message' => $ok
                ? 'Cloudflare security_level → ' . $value
                : 'Cloudflare API: ' . (string) ($res['errors'][0]['message'] ?? $res['_raw'] ?? 'error'),
        ];
    }
}

final class DdosGuardProvider extends AbstractProvider
{
    public function id(): string { return 'ddosguard'; }
    public function label(): string { return 'DDoS-Guard'; }

    public function credentialFields(): array
    {
        return [
            ['key' => 'ddosguard_enforce_edge', 'label' => 'DDoS-Guard — только трафик с edge', 'type' => 'checkbox', 'default' => false],
            ['key' => 'ddosguard_api_token', 'label' => 'DDoS-Guard — API token', 'type' => 'text', 'default' => '',
                'help' => 'Опционально: для удалённого управления защитой через API'],
            ['key' => 'ddosguard_service_id', 'label' => 'DDoS-Guard — ID услуги', 'type' => 'text', 'default' => ''],
            ['key' => 'ddosguard_extra_cidrs', 'label' => 'DDoS-Guard — CIDR edge (из кабинета)', 'type' => 'textarea', 'default' => '',
                'help' => 'Список подсетей прокси DDoS-Guard, по одной на строку'],
        ];
    }

    public function isConfigured(array $settings): bool
    {
        return true;
    }

    public function realIpHeaders(): array
    {
        return ['X-Real-IP', 'X-Forwarded-For', 'X-DDOS-GUARD-REAL-IP'];
    }

    public function edgeCidrs(array $settings): array
    {
        // DDoS-Guard publishes customer-specific proxy nets — rely on operator-provided CIDRs.
        $builtin = [
            '186.2.160.0/24', '186.2.164.0/24', '186.2.168.0/24',
            '77.220.207.0/24', '91.215.40.0/22',
        ];
        return $this->mergeCidrs($settings, $builtin, 'ddosguard_extra_cidrs');
    }

    public function setUnderAttack(bool $enabled, array $settings): array
    {
        $token = trim((string) ($settings['ddosguard_api_token'] ?? ''));
        $service = trim((string) ($settings['ddosguard_service_id'] ?? ''));
        if ($token === '' || $service === '') {
            return parent::setUnderAttack($enabled, $settings);
        }
        // Best-effort: DDoS-Guard API shape varies by product; store intent locally if remote fails.
        $res = $this->httpJson(
            'POST',
            'https://api.ddos-guard.net/v1/service/' . rawurlencode($service) . '/protection',
            ['mode' => $enabled ? 'under_attack' : 'normal'],
            ['Authorization: Bearer ' . $token],
        );
        $code = (int) ($res['_http'] ?? 0);
        if ($code >= 200 && $code < 300) {
            return ['ok' => true, 'message' => 'DDoS-Guard: режим ' . ($enabled ? 'under_attack' : 'normal')];
        }
        return [
            'ok' => true,
            'message' => 'Локальный under-attack ' . ($enabled ? 'вкл' : 'выкл')
                . '. Удалённый API DDoS-Guard не подтвердил смену — проверьте токен/ID или переключите в кабинете.',
        ];
    }
}

final class StormWallProvider extends AbstractProvider
{
    public function id(): string { return 'stormwall'; }
    public function label(): string { return 'StormWall'; }

    public function credentialFields(): array
    {
        return [
            ['key' => 'stormwall_enforce_edge', 'label' => 'StormWall — только трафик с edge', 'type' => 'checkbox', 'default' => false],
            ['key' => 'stormwall_api_key', 'label' => 'StormWall — API key', 'type' => 'text', 'default' => ''],
            ['key' => 'stormwall_domain_id', 'label' => 'StormWall — Domain / Service ID', 'type' => 'text', 'default' => ''],
            ['key' => 'stormwall_extra_cidrs', 'label' => 'StormWall — CIDR edge', 'type' => 'textarea', 'default' => ''],
        ];
    }

    public function isConfigured(array $settings): bool
    {
        return true;
    }

    public function realIpHeaders(): array
    {
        return ['X-Real-IP', 'X-Forwarded-For', 'X-STW-IP'];
    }

    public function edgeCidrs(array $settings): array
    {
        $builtin = [
            '5.188.0.0/16', '5.178.0.0/16', '185.71.0.0/16',
        ];
        return $this->mergeCidrs($settings, $builtin, 'stormwall_extra_cidrs');
    }

    public function setUnderAttack(bool $enabled, array $settings): array
    {
        $key = trim((string) ($settings['stormwall_api_key'] ?? ''));
        $domain = trim((string) ($settings['stormwall_domain_id'] ?? ''));
        if ($key === '' || $domain === '') {
            return parent::setUnderAttack($enabled, $settings);
        }
        $res = $this->httpJson(
            'POST',
            'https://api.stormwall.pro/v1/domains/' . rawurlencode($domain) . '/protection',
            ['under_attack' => $enabled],
            ['X-Api-Key: ' . $key],
        );
        $code = (int) ($res['_http'] ?? 0);
        if ($code >= 200 && $code < 300) {
            return ['ok' => true, 'message' => 'StormWall under_attack=' . ($enabled ? 'true' : 'false')];
        }
        return [
            'ok' => true,
            'message' => 'Локальный under-attack ' . ($enabled ? 'вкл' : 'выкл')
                . '. StormWall API не подтвердил — переключите защиту в кабинете StormWall.',
        ];
    }
}

final class QratorProvider extends AbstractProvider
{
    public function id(): string { return 'qrator'; }
    public function label(): string { return 'Qrator Labs'; }

    public function credentialFields(): array
    {
        return [
            ['key' => 'qrator_enforce_edge', 'label' => 'Qrator — только трафик с edge', 'type' => 'checkbox', 'default' => false],
            ['key' => 'qrator_api_token', 'label' => 'Qrator — API token', 'type' => 'text', 'default' => ''],
            ['key' => 'qrator_domain_id', 'label' => 'Qrator — Domain ID', 'type' => 'text', 'default' => ''],
            ['key' => 'qrator_extra_cidrs', 'label' => 'Qrator — CIDR edge', 'type' => 'textarea', 'default' => '',
                'help' => 'Подсети Qrator из личного кабинета / тикета'],
        ];
    }

    public function isConfigured(array $settings): bool
    {
        return true;
    }

    public function realIpHeaders(): array
    {
        return ['X-Real-IP', 'X-Forwarded-For', 'X-Qrator-IP'];
    }

    public function edgeCidrs(array $settings): array
    {
        // Qrator assigns dedicated anycast prefixes per customer — operator CIDRs required for shield.
        return $this->mergeCidrs($settings, [], 'qrator_extra_cidrs');
    }

    public function setUnderAttack(bool $enabled, array $settings): array
    {
        $token = trim((string) ($settings['qrator_api_token'] ?? ''));
        $domain = trim((string) ($settings['qrator_domain_id'] ?? ''));
        if ($token === '' || $domain === '') {
            return parent::setUnderAttack($enabled, $settings);
        }
        $res = $this->httpJson(
            'POST',
            'https://api.qrator.net/request/domain/' . rawurlencode($domain) . '/protection',
            ['level' => $enabled ? 'under_attack' : 'normal'],
            ['X-Qrator-Auth: ' . $token],
        );
        $code = (int) ($res['_http'] ?? 0);
        if ($code >= 200 && $code < 300) {
            return ['ok' => true, 'message' => 'Qrator protection → ' . ($enabled ? 'under_attack' : 'normal')];
        }
        return [
            'ok' => true,
            'message' => 'Локальный under-attack ' . ($enabled ? 'вкл' : 'выкл')
                . '. Qrator API не подтвердил — используйте кабинет Qrator Labs.',
        ];
    }
}
