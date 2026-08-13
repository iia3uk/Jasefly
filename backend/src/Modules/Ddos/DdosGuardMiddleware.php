<?php
declare(strict_types=1);

namespace App\Modules\Ddos;

use App\Request;
use App\Response;

/**
 * Global middleware: origin shield + under-attack rate limit / challenge.
 */
final class DdosGuardMiddleware
{
    public function __construct(private DdosService $service) {}

    public function __invoke(Request $r, callable $next): mixed
    {
        if (!$this->service->protectionEnabled()) {
            return $next();
        }

        $enabled = $this->service->enabledProviders();
        if ($enabled === [] && !$this->service->underAttack()) {
            return $next();
        }

        // Health checks always pass (uptime monitors may hit origin directly).
        if (str_ends_with($r->path, '/health')
            || str_ends_with($r->path, '/payments/webhook')
            || \App\Support\PlatformFingerprint::isWellKnownPath($r->path)) {
            // Still resolve real IP for webhooks when behind edge.
            $this->service->inspectPeer($r);
            return $next();
        }

        $info = $this->service->inspectPeer($r);
        if ($info['blocked']) {
            $msg = (string) ($this->service->settings()['block_message'] ?? 'Access denied by DDoS protection.');
            Response::json([
                'success' => false,
                'error' => $msg,
                'errors' => ['reason' => $info['reason']],
            ], 403);
        }

        if ($info['provider']) {
            header('X-CMS-DDoS-Provider: ' . $info['provider']);
        }
        if ($this->service->underAttack()) {
            header('X-CMS-DDoS-Mode: under-attack');
        }

        $settings = $this->service->settings();
        $adminBypass = (bool) ($settings['admin_bypass'] ?? true);
        $isAdminApi = str_contains($r->path, '/admin/') || str_contains($r->path, '/auth/');
        if ($adminBypass && $isAdminApi && $r->bearer()) {
            return $next();
        }

        $ip = $info['ip'];
        // Live-chat polling has its own SoftRateLimit; global DDoS rpm would 429 the widget.
        if (str_contains($r->path, '/support/')) {
            return $next();
        }
        $endpoint = $r->method . ':' . $r->path;

        if (!$this->service->rateLimitAllow($ip, $endpoint)) {
            if ($this->service->underAttack()
                && (bool) ($settings['challenge_enabled'] ?? true)
                && !$this->service->hasValidChallengeCookie()
                && $r->method === 'GET'
                && !str_contains((string) ($_SERVER['HTTP_ACCEPT'] ?? ''), 'application/json')) {
                $this->service->serveChallenge();
            }
            Response::error('Too many requests. DDoS protection.', 429);
        }

        if ($this->service->underAttack()
            && (bool) ($settings['challenge_enabled'] ?? true)
            && !$isAdminApi
            && $r->method === 'GET'
            && !$this->service->hasValidChallengeCookie()
            && !str_contains((string) ($_SERVER['HTTP_ACCEPT'] ?? ''), 'application/json')) {
            // Soft challenge once per hour for browser GETs during under-attack.
            $this->service->serveChallenge();
        }

        return $next();
    }
}
