<?php
declare(strict_types=1);

namespace App\Support;

use App\Database;
use App\Request;

/**
 * Dual-secret MCP authentication: Bearer identity + HMAC proof-of-possession.
 *
 * Canonical string (v1):
 *   v1\n{METHOD}\n{PATH}\n{TS}\n{NONCE}\n{sha256_hex(body)}
 *
 * Modes: legacy | prefer | require (empty signing secret forces legacy).
 */
final class McpRequestAuth
{
    public const HEADER_TS = 'X-Jasefly-Ts';
    public const HEADER_NONCE = 'X-Jasefly-Nonce';
    public const HEADER_SIGN = 'X-Jasefly-Sign';

    /**
     * @param array<string, mixed> $app
     * @return array{status: 'authenticated'|'rejected'|'skip', user?: array<string, mixed>, reason?: string}
     */
    public static function authenticate(Request $r, array $app, ?Database $db = null): array
    {
        $token = (string) ($app['mcp_api_token'] ?? '');
        $bearer = $r->bearer() ?? '';
        if ($token === '' || $bearer === '' || !hash_equals($token, $bearer)) {
            return ['status' => 'skip', 'reason' => 'not_mcp'];
        }

        $signingSecret = (string) ($app['mcp_signing_secret'] ?? '');
        $mode = self::effectiveMode((string) ($app['mcp_auth_mode'] ?? 'legacy'), $signingSecret);
        $skew = max(30, (int) ($app['mcp_skew_seconds'] ?? 300));

        if (!self::ipAllowed($r->ip(), (string) ($app['mcp_allowed_ips'] ?? ''))) {
            return ['status' => 'rejected', 'reason' => 'ip_denied'];
        }

        $ts = trim((string) ($r->header(self::HEADER_TS) ?? ''));
        $nonce = trim((string) ($r->header(self::HEADER_NONCE) ?? ''));
        $sign = trim((string) ($r->header(self::HEADER_SIGN) ?? ''));
        $hasSig = $ts !== '' && $nonce !== '' && $sign !== '';

        if (!$hasSig) {
            if ($mode === 'require') {
                return ['status' => 'rejected', 'reason' => 'signature_required'];
            }
            if ($mode === 'prefer') {
                @error_log('McpRequestAuth: unsigned MCP Bearer accepted (prefer mode)');
            }
            return ['status' => 'authenticated', 'user' => self::mcpUser()];
        }

        if ($signingSecret === '') {
            // Headers present but no server secret — treat as unsigned for legacy/prefer.
            if ($mode === 'require') {
                return ['status' => 'rejected', 'reason' => 'signing_not_configured'];
            }
            return ['status' => 'authenticated', 'user' => self::mcpUser()];
        }

        if (!ctype_digit($ts)) {
            return ['status' => 'rejected', 'reason' => 'bad_ts'];
        }
        $tsInt = (int) $ts;
        if (abs(time() - $tsInt) > $skew) {
            return ['status' => 'rejected', 'reason' => 'skew'];
        }

        if (!preg_match('/^[a-fA-F0-9]{32,128}$/', $nonce)) {
            return ['status' => 'rejected', 'reason' => 'bad_nonce'];
        }

        $bodyHash = self::bodyHash($r);
        $canonical = self::canonical($r->method, $r->path, $ts, strtolower($nonce), $bodyHash);
        $expected = 'v1=' . hash_hmac('sha256', $canonical, $signingSecret);
        if (!hash_equals($expected, $sign)) {
            return ['status' => 'rejected', 'reason' => 'bad_signature'];
        }

        $claimed = self::claimNonce(strtolower($nonce), $tsInt + $skew + 60, $app, $db);
        if ($claimed === 'replay') {
            return ['status' => 'rejected', 'reason' => 'replay'];
        }
        if ($claimed === 'unavailable') {
            return ['status' => 'rejected', 'reason' => 'nonce_store_unavailable'];
        }

        return ['status' => 'authenticated', 'user' => self::mcpUser()];
    }

    public static function canonical(string $method, string $path, string $ts, string $nonce, string $bodyHash): string
    {
        return 'v1'
            . "\n" . strtoupper($method)
            . "\n" . $path
            . "\n" . $ts
            . "\n" . $nonce
            . "\n" . $bodyHash;
    }

    public static function bodyHash(Request $r): string
    {
        $contentType = strtolower((string) ($_SERVER['CONTENT_TYPE'] ?? ''));
        if (str_contains($contentType, 'multipart/form-data')) {
            return hash('sha256', '');
        }
        return hash('sha256', $r->rawBody());
    }

    /** @return array<string, mixed> */
    public static function mcpUser(): array
    {
        return [
            'sub' => null,
            'email' => 'mcp@cms.local',
            'name' => 'MCP Agent',
            'role' => 'super_admin',
            'type' => 'access',
            'auth' => 'mcp_token',
        ];
    }

    public static function effectiveMode(string $configured, string $signingSecret): string
    {
        $mode = strtolower(trim($configured));
        if (!in_array($mode, ['legacy', 'prefer', 'require'], true)) {
            $mode = 'legacy';
        }
        if ($signingSecret === '') {
            return 'legacy';
        }
        return $mode;
    }

    public static function ipAllowed(string $ip, string $allowlist): bool
    {
        $allowlist = trim($allowlist);
        if ($allowlist === '') {
            return true;
        }
        $parts = preg_split('/[\s,;]+/', $allowlist) ?: [];
        foreach ($parts as $entry) {
            $entry = trim($entry);
            if ($entry === '') {
                continue;
            }
            if (str_contains($entry, '/')) {
                if (self::cidrMatch($ip, $entry)) {
                    return true;
                }
                continue;
            }
            if (hash_equals($entry, $ip)) {
                return true;
            }
        }
        return false;
    }

    private static function cidrMatch(string $ip, string $cidr): bool
    {
        $bits = explode('/', $cidr, 2);
        if (count($bits) !== 2) {
            return false;
        }
        [$subnet, $maskStr] = $bits;
        $mask = (int) $maskStr;
        $ipBin = @inet_pton($ip);
        $subnetBin = @inet_pton($subnet);
        if ($ipBin === false || $subnetBin === false || strlen($ipBin) !== strlen($subnetBin)) {
            return false;
        }
        $len = strlen($ipBin) * 8;
        if ($mask < 0 || $mask > $len) {
            return false;
        }
        $fullBytes = intdiv($mask, 8);
        $remBits = $mask % 8;
        if ($fullBytes > 0 && substr($ipBin, 0, $fullBytes) !== substr($subnetBin, 0, $fullBytes)) {
            return false;
        }
        if ($remBits === 0) {
            return true;
        }
        $maskByte = (0xFF << (8 - $remBits)) & 0xFF;
        return (ord($ipBin[$fullBytes]) & $maskByte) === (ord($subnetBin[$fullBytes]) & $maskByte);
    }

    /**
     * @param array<string, mixed> $app
     * @return 'ok'|'replay'|'unavailable'
     */
    private static function claimNonce(string $nonce, int $expiresAt, array $app, ?Database $db): string
    {
        if ($db !== null) {
            $dbResult = self::claimNonceDb($db, $nonce, $expiresAt);
            if ($dbResult !== 'unavailable') {
                return $dbResult;
            }
        }
        return self::claimNonceFile($app, $nonce, $expiresAt);
    }

    /** @return 'ok'|'replay'|'unavailable' */
    private static function claimNonceDb(Database $db, string $nonce, int $expiresAt): string
    {
        try {
            if (random_int(1, 20) === 1) {
                try {
                    $db->run('DELETE FROM mcp_nonces WHERE expires_at < ?', [date('Y-m-d H:i:s')]);
                } catch (\Throwable) {
                    // ignore cleanup failures
                }
            }
            $db->run(
                'INSERT INTO mcp_nonces (nonce, expires_at) VALUES (?, ?)',
                [$nonce, date('Y-m-d H:i:s', $expiresAt)]
            );
            return 'ok';
        } catch (\Throwable $e) {
            $msg = strtolower($e->getMessage());
            if (
                str_contains($msg, 'duplicate')
                || str_contains($msg, 'unique')
                || str_contains($msg, 'primary')
            ) {
                return 'replay';
            }
            return 'unavailable';
        }
    }

    /**
     * @param array<string, mixed> $app
     * @return 'ok'|'replay'|'unavailable'
     */
    private static function claimNonceFile(array $app, string $nonce, int $expiresAt): string
    {
        $storage = (string) ($app['storage'] ?? '');
        if ($storage === '') {
            return 'unavailable';
        }
        $dir = rtrim($storage, '/\\') . DIRECTORY_SEPARATOR . 'mcp_nonces';
        if (!is_dir($dir) && !@mkdir($dir, 0750, true) && !is_dir($dir)) {
            return 'unavailable';
        }
        // Opportunistic cleanup
        if (random_int(1, 25) === 1) {
            self::cleanupNonceFiles($dir);
        }
        $file = $dir . DIRECTORY_SEPARATOR . hash('sha256', $nonce) . '.nonce';
        if (is_file($file)) {
            $raw = @file_get_contents($file);
            $prev = is_string($raw) ? (int) trim($raw) : 0;
            if ($prev >= time()) {
                return 'replay';
            }
            @unlink($file);
        }
        $fh = @fopen($file, 'x');
        if ($fh === false) {
            return 'replay';
        }
        $ok = @fwrite($fh, (string) $expiresAt) !== false;
        @fclose($fh);
        return $ok ? 'ok' : 'unavailable';
    }

    private static function cleanupNonceFiles(string $dir): void
    {
        $now = time();
        foreach (glob($dir . DIRECTORY_SEPARATOR . '*.nonce') ?: [] as $path) {
            $raw = @file_get_contents($path);
            $exp = is_string($raw) ? (int) trim($raw) : 0;
            if ($exp > 0 && $exp < $now) {
                @unlink($path);
            }
        }
    }
}
