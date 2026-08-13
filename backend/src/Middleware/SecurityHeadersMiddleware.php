<?php
declare(strict_types=1);

namespace App\Middleware;

use App\Request;

/**
 * Security headers middleware: Content-Security-Policy + hardening headers.
 *
 * The CSP is report-only-friendly: it restricts script/object/iframe
 * sources while allowing the admin editor (inline styles, the TipTap
 * rich text editor, and trusted CDN assets). 'unsafe-inline' for styles
 * is required by the editor's runtime styling; scripts are restricted to
 * 'self' and the configured CDN allowlist.
 *
 * COEP is intentionally omitted — it breaks third-party media/CDN on
 * typical shared hosting. HSTS is set only when the request is HTTPS.
 */
final class SecurityHeadersMiddleware
{
    /** @param list<string> $scriptCdnAllowlist extra script-src hosts (e.g. CDN domains) */
    public function __construct(private array $scriptCdnAllowlist = []) {}

    public function __invoke(Request $r, callable $next): mixed
    {
        $scriptSrc = "'self'" . implode('', array_map(fn($h) => " $h", $this->scriptCdnAllowlist));
        // 'unsafe-inline' for styles because the editor/runtime uses inline styles;
        // scripts are locked to self + allowlist (no unsafe-inline).
        $csp = [
            "default-src 'self'",
            "script-src $scriptSrc",
            "style-src 'self' 'unsafe-inline'",
            "img-src 'self' data: blob: https:",
            "media-src 'self' https:",
            "font-src 'self' data:",
            "object-src 'none'",
            "base-uri 'self'",
            "form-action 'self'",
            "frame-ancestors 'self'",
            "connect-src 'self' https:",
            "frame-src 'self' https:",
        ];

        header("Content-Security-Policy: " . implode('; ', $csp));
        header('X-Content-Type-Options: nosniff');
        header('X-Frame-Options: SAMEORIGIN');
        header('Referrer-Policy: strict-origin-when-cross-origin');
        header('Permissions-Policy: camera=(), microphone=(), geolocation=()');
        header('X-XSS-Protection: 1; mode=block');
        header('Cross-Origin-Opener-Policy: same-origin');
        header('Cross-Origin-Resource-Policy: same-origin');
        // Hide PHP/runtime version. Do not set X-Powered-By (empty or Jasefly):
        // an empty CGI header is filled back as PHP/{version} by php-fpm.
        \App\Support\RuntimeHardening::hidePhpFingerprint();
        \App\Support\PlatformFingerprint::applyResponseHeaders();

        if (self::isHttps()) {
            header('Strict-Transport-Security: max-age=31536000; includeSubDomains');
        }

        return $next();
    }

    private static function isHttps(): bool
    {
        if (!empty($_SERVER['HTTPS']) && (string) $_SERVER['HTTPS'] !== 'off') {
            return true;
        }
        $fwd = strtolower((string) ($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? ''));
        if ($fwd === 'https') {
            return true;
        }
        return (int) ($_SERVER['SERVER_PORT'] ?? 0) === 443;
    }
}
