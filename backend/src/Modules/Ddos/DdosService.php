<?php
declare(strict_types=1);

namespace App\Modules\Ddos;

use App\Database;
use App\Modules\Ddos\Providers\ProviderCatalog;
use App\Modules\Ddos\Providers\ProviderInterface;
use App\Request;
use App\Response;

/**
 * Orchestrates multi-provider DDoS edge protection for the CMS origin.
 */
final class DdosService
{
    /** @param array<string, mixed> $settings */
    public function __construct(
        private Database $db,
        private array $settings,
        private string $storagePath = '',
    ) {}

    /** @return array<string, mixed> */
    public function settings(): array
    {
        return $this->settings;
    }

    public function protectionEnabled(): bool
    {
        return (bool) ($this->settings['protection_enabled'] ?? true);
    }

    public function underAttack(): bool
    {
        return (bool) ($this->settings['under_attack'] ?? false);
    }

    /** @return list<ProviderInterface> */
    public function enabledProviders(): array
    {
        $out = [];
        foreach (ProviderCatalog::all() as $p) {
            if ($p->isEnabled($this->settings)) {
                $out[] = $p;
            }
        }
        return $out;
    }

    /** @return array<string, mixed> */
    public function publicStatus(): array
    {
        $providers = [];
        foreach (ProviderCatalog::all() as $p) {
            $providers[] = $p->status($this->settings);
        }
        return [
            'protection_enabled' => $this->protectionEnabled(),
            'under_attack' => $this->underAttack(),
            'under_attack_rpm' => (int) ($this->settings['under_attack_rpm'] ?? 30),
            'normal_rpm' => (int) ($this->settings['normal_rpm'] ?? 120),
            'challenge_enabled' => (bool) ($this->settings['challenge_enabled'] ?? true),
            'providers' => $providers,
            'active_count' => count($this->enabledProviders()),
        ];
    }

    /**
     * Resolve visitor IP from enabled providers' headers when peer is on their edge.
     * Sets $_SERVER['CMS_REAL_IP'] when trusted.
     *
     * @return array{ip:string, provider:?string, edge_ok:bool, blocked:bool, reason:?string}
     */
    public function inspectPeer(Request $r): array
    {
        $peer = $_SERVER['REMOTE_ADDR'] ?? '0.0.0.0';
        $enabled = $this->enabledProviders();
        if ($enabled === [] || !$this->protectionEnabled()) {
            return ['ip' => $peer, 'provider' => null, 'edge_ok' => true, 'blocked' => false, 'reason' => null];
        }

        $matched = null;
        $onEdge = false;
        foreach ($enabled as $p) {
            $enforce = (bool) ($this->settings[$p->id() . '_enforce_edge'] ?? false);
            $cidrs = $p->edgeCidrs($this->settings);
            $peerIsEdge = $cidrs === [] ? !$enforce : IpUtils::inAny($peer, $cidrs);
            if ($peerIsEdge) {
                $onEdge = true;
                $matched = $p;
                $real = $this->extractRealIp($r, $p->realIpHeaders());
                if ($real !== null) {
                    $_SERVER['CMS_REAL_IP'] = $real;
                    return [
                        'ip' => $real,
                        'provider' => $p->id(),
                        'edge_ok' => true,
                        'blocked' => false,
                        'reason' => null,
                    ];
                }
                // On edge but no real-ip header — keep peer (edge itself).
                return [
                    'ip' => $peer,
                    'provider' => $p->id(),
                    'edge_ok' => true,
                    'blocked' => false,
                    'reason' => null,
                ];
            }
            if ($enforce && $cidrs !== []) {
                // This provider enforces shield and peer is not on its list — keep checking others.
                continue;
            }
        }

        // If any enabled provider enforces edge and peer matched none — block.
        foreach ($enabled as $p) {
            $enforce = (bool) ($this->settings[$p->id() . '_enforce_edge'] ?? false);
            $cidrs = $p->edgeCidrs($this->settings);
            if ($enforce && $cidrs !== [] && !IpUtils::inAny($peer, $cidrs)) {
                return [
                    'ip' => $peer,
                    'provider' => $p->id(),
                    'edge_ok' => false,
                    'blocked' => true,
                    'reason' => 'origin_shield:' . $p->id(),
                ];
            }
        }

        return [
            'ip' => $peer,
            'provider' => $matched?->id(),
            'edge_ok' => $onEdge || true,
            'blocked' => false,
            'reason' => null,
        ];
    }

    public function rateLimitAllow(string $ip, string $endpoint): bool
    {
        $rpm = $this->underAttack()
            ? max(5, (int) ($this->settings['under_attack_rpm'] ?? 30))
            : max(20, (int) ($this->settings['normal_rpm'] ?? 120));
        $window = 60;
        $windowStart = date('Y-m-d H:i:s', time() - $window);
        $key = 'ddos:' . $endpoint;
        try {
            $row = $this->db->one(
                'SELECT id, attempts FROM rate_limits WHERE ip_address=? AND endpoint=? AND window_start >= ? ORDER BY id DESC LIMIT 1',
                [$ip, $key, $windowStart],
            );
            if ($row) {
                if ((int) $row['attempts'] >= $rpm) {
                    return false;
                }
                $this->db->run('UPDATE rate_limits SET attempts = attempts + 1 WHERE id=?', [$row['id']]);
                return true;
            }
            $this->db->run(
                'INSERT INTO rate_limits(ip_address, endpoint, attempts, window_start) VALUES(?,?,1,NOW())',
                [$ip, $key],
            );
            return true;
        } catch (\Throwable) {
            return true; // fail-open if rate_limits missing
        }
    }

    public function challengeSecret(): string
    {
        $secret = trim((string) ($this->settings['challenge_secret'] ?? ''));
        if ($secret !== '') {
            return $secret;
        }
        // Derive stable secret from jwt if present in app — caller should persist settings.
        return hash('sha256', 'cms-ddos-challenge');
    }

    public function issueChallengeCookie(): void
    {
        $exp = time() + 3600;
        $sig = hash_hmac('sha256', (string) $exp, $this->challengeSecret());
        $val = $exp . '.' . $sig;
        setcookie('cms_ddos_pass', $val, [
            'expires' => $exp,
            'path' => '/',
            'secure' => (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off'),
            'httponly' => true,
            'samesite' => 'Lax',
        ]);
    }

    public function hasValidChallengeCookie(): bool
    {
        $raw = (string) ($_COOKIE['cms_ddos_pass'] ?? '');
        if ($raw === '' || !str_contains($raw, '.')) {
            return false;
        }
        [$exp, $sig] = explode('.', $raw, 2);
        if ((int) $exp < time()) {
            return false;
        }
        $expect = hash_hmac('sha256', $exp, $this->challengeSecret());
        return hash_equals($expect, $sig);
    }

    /**
     * Serve a minimal JS challenge page (sets cookie after 1s delay).
     */
    public function serveChallenge(): never
    {
        $exp = time() + 3600;
        $sig = hash_hmac('sha256', (string) $exp, $this->challengeSecret());
        $val = htmlspecialchars($exp . '.' . $sig, ENT_QUOTES);
        $secure = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? '; Secure' : '';
        http_response_code(503);
        header('Content-Type: text/html; charset=utf-8');
        header('Retry-After: 2');
        echo '<!doctype html><html><head><meta charset="utf-8"><title>Checking your browser</title>'
            . '<style>body{font-family:system-ui,sans-serif;background:#0a0a0b;color:#e8eaef;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0}'
            . '.box{max-width:26rem;padding:2rem;border:1px solid rgba(255,255,255,.1);border-radius:12px;text-align:center}</style></head><body>'
            . '<div class="box"><h1 style="font-size:1.1rem;margin:0 0 .5rem">Проверка браузера</h1>'
            . '<p style="color:#8b95a8;font-size:.875rem;margin:0">DDoS protection · подождите секунду…</p></div>'
            . '<script>document.cookie="cms_ddos_pass=' . $val . '; Path=/; Max-Age=3600; SameSite=Lax' . $secure . '";'
            . 'setTimeout(function(){location.reload()},900);</script></body></html>';
        exit;
    }

    /** @return array{ok:bool, results:list<array<string,mixed>>} */
    public function setUnderAttackAll(bool $enabled): array
    {
        $results = [];
        foreach ($this->enabledProviders() as $p) {
            $results[] = array_merge(['provider' => $p->id(), 'label' => $p->label()], $p->setUnderAttack($enabled, $this->settings));
        }
        if ($results === []) {
            $results[] = ['provider' => 'local', 'label' => 'Local', 'ok' => true, 'message' => 'Нет включённых провайдеров — только локальный режим'];
        }
        return ['ok' => true, 'results' => $results];
    }

    /** Refresh Cloudflare published IP ranges into settings cache file. */
    public function syncCloudflareRanges(): array
    {
        $v4 = @file_get_contents('https://www.cloudflare.com/ips-v4');
        $v6 = @file_get_contents('https://www.cloudflare.com/ips-v6');
        $cidrs = [];
        foreach ([$v4, $v6] as $body) {
            if (!is_string($body) || $body === '') {
                continue;
            }
            foreach (preg_split('/\s+/', trim($body)) ?: [] as $line) {
                if ($line !== '') {
                    $cidrs[] = $line;
                }
            }
        }
        if ($cidrs === []) {
            return ['ok' => false, 'message' => 'Не удалось скачать списки Cloudflare', 'count' => 0];
        }
        $path = rtrim($this->storagePath, '/\\') . '/ddos_cloudflare_cidrs.json';
        @file_put_contents($path, json_encode(['updated' => gmdate(DATE_ATOM), 'cidrs' => $cidrs], JSON_UNESCAPED_UNICODE));
        return ['ok' => true, 'message' => 'Обновлено CIDR Cloudflare', 'count' => count($cidrs), 'path' => $path];
    }

    /** @return list<string>|null */
    public function cachedCloudflareCidrs(): ?array
    {
        $path = rtrim($this->storagePath, '/\\') . '/ddos_cloudflare_cidrs.json';
        if (!is_file($path)) {
            return null;
        }
        $data = json_decode((string) file_get_contents($path), true);
        return is_array($data['cidrs'] ?? null) ? $data['cidrs'] : null;
    }

    /** @param list<string> $headers */
    private function extractRealIp(Request $r, array $headers): ?string
    {
        foreach ($headers as $name) {
            $val = $r->header($name);
            if ($val === null || $val === '') {
                // Also check $_SERVER style
                $key = 'HTTP_' . strtoupper(str_replace('-', '_', $name));
                $val = $_SERVER[$key] ?? null;
            }
            if (!is_string($val) || $val === '') {
                continue;
            }
            // X-Forwarded-For may be a list — take first public-looking hop.
            $parts = array_map('trim', explode(',', $val));
            foreach ($parts as $part) {
                if (filter_var($part, FILTER_VALIDATE_IP)) {
                    return $part;
                }
            }
        }
        return null;
    }
}
