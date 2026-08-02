<?php
declare(strict_types=1);

namespace App\Modules\Demo;

/**
 * Fail-closed route policy for demo sessions.
 * Modes: pass | interactive | preview | deny
 *
 * Full demo admin UX: GET almost everything as preview/synthetic.
 * Destructive / production-mutating paths stay deny on write.
 */
final class DemoRoutePolicy
{
    public const PASS = 'pass';
    public const INTERACTIVE = 'interactive';
    public const PREVIEW = 'preview';
    public const DENY = 'deny';

    /** Normalize /api/v1/admin/... → admin/... */
    public static function normalizePath(string $path): string
    {
        $p = '/' . trim($path, '/');
        $p = preg_replace('#^/api(?:/v1)?/#', '/', $p) ?? $p;
        return trim($p, '/') ?: '';
    }

    public static function decide(string $method, string $path): string
    {
        $m = strtoupper($method);
        $p = self::normalizePath($path);

        // Always allow demo session endpoints + me
        if ($p === 'auth/me' || str_starts_with($p, 'auth/demo/')) {
            return self::PASS;
        }

        // Public / non-admin never hijacked
        if ($p === 'health' || $p === '' || !str_starts_with($p, 'admin/')) {
            return self::PASS;
        }

        // Hard deny — secret / remote-control / package install surfaces (any method)
        $hardDeny = [
            'admin/content-pack',
            'admin/mcp',
            'admin/modules/upload',
        ];
        foreach ($hardDeny as $prefix) {
            if ($p === $prefix || str_starts_with($p, $prefix . '/')) {
                return self::DENY;
            }
        }

        // Write-deny prefixes (GET → preview for UI; POST/PUT/PATCH/DELETE → deny)
        $writeDenyPrefixes = [
            'admin/migrations',
            'admin/updates',
            'admin/backup',
            'admin/email-settings',
            'admin/password',
            'admin/webhooks',
            'admin/plugins',
            'admin/ddos',
            'admin/overload',
            'admin/platform',
            'admin/scheduler',
            'admin/automations',
            'admin/newsletter',
            'admin/notifications',
            'admin/orders',
            'admin/payments',
            'admin/form-submissions',
            'admin/trash',
            'admin/module-operations',
        ];
        foreach ($writeDenyPrefixes as $prefix) {
            if ($p === $prefix || str_starts_with($p, $prefix . '/')) {
                return $m === 'GET' ? self::PREVIEW : self::DENY;
            }
        }

        // Modules: view ok, mutate deny
        if (str_starts_with($p, 'admin/modules')) {
            if (preg_match('#/(install|update|enable|disable|delete|upload|certify|uninstall|rollback|inspect)#', $p)) {
                return self::DENY;
            }
            if ($m !== 'GET') {
                // health etc. — still deny (no production side effects)
                return self::DENY;
            }
            return self::PREVIEW;
        }

        // Users / roles / access writes
        if (str_starts_with($p, 'admin/users')) {
            return $m === 'GET' ? self::PREVIEW : self::DENY;
        }
        if (str_starts_with($p, 'admin/roles') || str_starts_with($p, 'admin/permissions')) {
            return $m === 'GET' ? self::PREVIEW : self::DENY;
        }
        if (str_starts_with($p, 'admin/access')) {
            return $m === 'GET' ? self::PREVIEW : self::DENY;
        }

        // Site settings — preview redacted only
        if (preg_match('#^admin/(site-settings|theme|seo|footer|hero|contact-info|profile|email-settings)(/|$)#', $p)) {
            return $m === 'GET' ? self::PREVIEW : self::DENY;
        }

        // System diagnostics — synthetic preview
        if (str_starts_with($p, 'admin/system')) {
            return $m === 'GET' ? self::PREVIEW : self::DENY;
        }

        // Demo bootstrap
        if (str_starts_with($p, 'admin/demo')) {
            return self::INTERACTIVE;
        }

        // Page templates catalog — read-only / noop
        if (str_starts_with($p, 'admin/page-templates')) {
            return self::PREVIEW;
        }

        // Pages / builder — interactive overlay only
        if (str_starts_with($p, 'admin/pages')) {
            return self::INTERACTIVE;
        }

        // Media — list/meta interactive; upload restricted in gateway
        if (str_starts_with($p, 'admin/media')) {
            if ($m === 'DELETE') {
                return self::DENY;
            }
            return self::INTERACTIVE;
        }

        // Blog — overlay interactive
        if (str_starts_with($p, 'admin/blog') || str_starts_with($p, 'admin/posts')) {
            return self::INTERACTIVE;
        }

        // Dashboard / search / activity / navigation
        if (
            preg_match('#^admin/?$#', $p)
            || str_starts_with($p, 'admin/dashboard')
            || str_starts_with($p, 'admin/search')
            || str_starts_with($p, 'admin/activity')
            || str_starts_with($p, 'admin/navigation')
        ) {
            if (str_starts_with($p, 'admin/navigation')) {
                return $m === 'GET' ? self::PREVIEW : self::DENY;
            }
            return $m === 'GET' ? self::PREVIEW : self::DENY;
        }

        // Full demo admin: any other admin GET → synthetic preview; writes denied
        if ($m === 'GET') {
            return self::PREVIEW;
        }

        return self::DENY;
    }
}
