<?php
declare(strict_types=1);

namespace App\Support;

/**
 * Decide whether a package frontend asset may be served to the current request.
 * Admin-only packs require a staff/demo AuthCookie (or Bearer); public packs stay guest-readable.
 */
final class ModuleAssetGate
{
    /** Known admin-UI packages (no public widgets). */
    public const ADMIN_ONLY_SLUGS = [
        'ai-content-optimizer',
        'indexnow',
    ];

    public static function isAdminOnlySlug(string $slug): bool
    {
        $slug = strtolower(trim($slug));
        if ($slug === '' || !preg_match('/^[a-z0-9][a-z0-9_-]{0,63}$/', $slug)) {
            return true; // fail closed for weird slugs
        }
        return in_array($slug, self::ADMIN_ONLY_SLUGS, true);
    }

    /**
     * Sidecar written next to public module assets: {"public":true|false}
     *
     * @param array<string, mixed>|null $frontendManifest
     */
    public static function writeAccessFile(string $publicModuleRoot, string $slug, ?array $frontendManifest = null): void
    {
        $public = self::manifestIsPublic($slug, $frontendManifest);
        $payload = json_encode(['public' => $public, 'slug' => $slug], JSON_UNESCAPED_SLASHES);
        @file_put_contents(rtrim($publicModuleRoot, '/\\') . '/.access.json', $payload !== false ? $payload : '{"public":true}');
    }

    /** @param array<string, mixed>|null $frontendManifest */
    public static function manifestIsPublic(string $slug, ?array $frontendManifest): bool
    {
        if (self::isAdminOnlySlug($slug)) {
            return false;
        }
        if (!is_array($frontendManifest)) {
            return true;
        }
        if (array_key_exists('public', $frontendManifest)) {
            return (bool) $frontendManifest['public'];
        }
        $audience = strtolower((string) ($frontendManifest['audience'] ?? ''));
        if ($audience === 'admin') {
            return false;
        }
        return true;
    }

    public static function isPublicAccessFile(string $publicModuleRoot): bool
    {
        $file = rtrim($publicModuleRoot, '/\\') . '/.access.json';
        if (!is_file($file)) {
            return true; // BC: packages installed before gate
        }
        $raw = @file_get_contents($file);
        $decoded = is_string($raw) ? json_decode($raw, true) : null;
        if (!is_array($decoded)) {
            return true;
        }
        return !empty($decoded['public']);
    }

    public static function requestHasStaffSession(string $jwtSecret): bool
    {
        $bearer = '';
        $auth = $_SERVER['HTTP_AUTHORIZATION'] ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '';
        if (is_string($auth) && preg_match('/Bearer\s+(\S+)/i', $auth, $m)) {
            $bearer = $m[1];
        }
        if ($bearer === '') {
            $bearer = AuthCookie::token() ?? '';
        }
        if ($bearer === '' || $jwtSecret === '') {
            return false;
        }
        try {
            $payload = \App\Jwt::decode($bearer, $jwtSecret);
            $type = (string) ($payload['type'] ?? '');
            return $type === 'access' || ($type === 'demo_access' && !empty($payload['is_demo']));
        } catch (\Throwable) {
            return false;
        }
    }

    public static function ensureModulesHtaccess(string $publicModulesRoot): void
    {
        $dir = rtrim($publicModulesRoot, '/\\');
        if ($dir === '' || (!is_dir($dir) && !@mkdir($dir, 0755, true) && !is_dir($dir))) {
            return;
        }
        $ht = $dir . '/.htaccess';
        $body = <<<'HT'
# Package frontend assets — route through auth-aware gate (admin-only packs).
<IfModule mod_rewrite.c>
  RewriteEngine On
  RewriteBase /modules/
  RewriteRule ^\.access\.json$ - [F,L]
  RewriteCond %{REQUEST_FILENAME} -f
  RewriteRule ^(.*)$ /module-asset.php?f=$1 [L,QSA]
</IfModule>
Options -Indexes
HT;
        if (!is_file($ht) || trim((string) @file_get_contents($ht)) !== trim($body)) {
            @file_put_contents($ht, $body);
        }
    }
}
