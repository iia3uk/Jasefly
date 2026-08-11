<?php
declare(strict_types=1);

namespace App\Support;

use App\Database;

/**
 * Controls HTTP→HTTPS redirects via storage marker api/storage/.https_ok.
 * Apache .htaccess only forces HTTPS when that marker exists.
 *
 * Modes (storage/.https_mode): auto | force | off
 *  - auto: learn from real HTTPS requests / admin probe; clear marker on probe fail
 *  - force: always keep marker (admin asserts TLS exists)
 *  - off: never create marker (HTTP-only test domains)
 */
final class HttpsPolicy
{
    public const MODE_AUTO = 'auto';
    public const MODE_FORCE = 'force';
    public const MODE_OFF = 'off';

    public const MARKER_NAME = '.https_ok';
    public const MODE_NAME = '.https_mode';
    public const LAST_PROBE_NAME = '.https_last_probe.json';

    /**
     * Resolve storage directory (api/storage on hosting).
     */
    public static function storageDir(?string $storage = null): string
    {
        if (is_string($storage) && $storage !== '') {
            return rtrim(str_replace('\\', '/', $storage), '/');
        }
        $candidates = [
            dirname(__DIR__, 2) . '/storage',
        ];
        foreach ($candidates as $dir) {
            $norm = rtrim(str_replace('\\', '/', $dir), '/');
            if (is_dir($norm) || @mkdir($norm, 0755, true)) {
                return $norm;
            }
        }
        return rtrim(str_replace('\\', '/', dirname(__DIR__, 2) . '/storage'), '/');
    }

    public static function markerPath(?string $storage = null): string
    {
        return self::storageDir($storage) . '/' . self::MARKER_NAME;
    }

    public static function modePath(?string $storage = null): string
    {
        return self::storageDir($storage) . '/' . self::MODE_NAME;
    }

    public static function hasMarker(?string $storage = null): bool
    {
        return is_file(self::markerPath($storage));
    }

    public static function mode(?string $storage = null): string
    {
        $path = self::modePath($storage);
        if (!is_file($path)) {
            return self::MODE_AUTO;
        }
        $raw = strtolower(trim((string) @file_get_contents($path)));
        return self::normalizeMode($raw);
    }

    public static function normalizeMode(string $mode): string
    {
        $mode = strtolower(trim($mode));
        if (in_array($mode, [self::MODE_AUTO, self::MODE_FORCE, self::MODE_OFF], true)) {
            return $mode;
        }
        return self::MODE_AUTO;
    }

    /**
     * Persist mode and sync marker accordingly.
     *
     * @return array{mode:string, marker:bool}
     */
    public static function setMode(string $mode, ?string $storage = null): array
    {
        $storage = self::storageDir($storage);
        if (!is_dir($storage)) {
            @mkdir($storage, 0755, true);
        }
        $mode = self::normalizeMode($mode);
        @file_put_contents(self::modePath($storage), $mode . "\n");

        if ($mode === self::MODE_OFF) {
            self::clearMarker($storage);
        } elseif ($mode === self::MODE_FORCE) {
            self::writeMarker($storage);
        }

        return [
            'mode' => $mode,
            'marker' => self::hasMarker($storage),
        ];
    }

    public static function requestIsHttps(): bool
    {
        if (!empty($_SERVER['HTTPS']) && (string) $_SERVER['HTTPS'] !== 'off') {
            return true;
        }
        if ((string) ($_SERVER['SERVER_PORT'] ?? '') === '443') {
            return true;
        }
        $fwd = strtolower((string) ($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? ''));
        if ($fwd === 'https') {
            return true;
        }
        $front = strtolower((string) ($_SERVER['HTTP_FRONT_END_HTTPS'] ?? ''));
        return $front === 'on' || $front === '1';
    }

    /**
     * Passive learn: successful HTTPS request enables redirect gate (auto/force).
     * Safe to call on every request; no-op when mode=off or already marked.
     */
    public static function learnFromRequest(?string $storage = null): void
    {
        $storage = self::storageDir($storage);
        $mode = self::mode($storage);

        if ($mode === self::MODE_OFF) {
            if (self::hasMarker($storage)) {
                self::clearMarker($storage);
            }
            return;
        }

        if ($mode === self::MODE_FORCE) {
            if (!self::hasMarker($storage)) {
                self::writeMarker($storage);
            }
            return;
        }

        // auto
        if (self::requestIsHttps() && !self::hasMarker($storage)) {
            self::writeMarker($storage);
        }
    }

    /**
     * Active TLS probe against the site's own HTTPS origin (no client-supplied URL).
     *
     * @param array<string, mixed> $app
     * @return array{ok:bool, marker:bool, mode:string, url:string, status:int, error?:string}
     */
    public static function probe(?Database $db, array $app = [], ?string $storage = null): array
    {
        $storage = self::storageDir($storage ?? (isset($app['storage']) ? (string) $app['storage'] : null));
        $mode = self::mode($storage);
        $url = self::probeUrl($db, $app);

        if ($url === '') {
            $result = [
                'ok' => false,
                'marker' => self::hasMarker($storage),
                'mode' => $mode,
                'url' => '',
                'status' => 0,
                'error' => 'no_public_origin',
            ];
            self::storeLastProbe($storage, $result);
            return $result;
        }

        $res = OutboundHttp::request($url, [
            'method' => 'GET',
            'timeout' => 8,
            'headers' => ['Accept: text/html,*/*'],
        ]);

        $status = (int) ($res['status'] ?? 0);
        // Any completed TLS response (even 4xx/5xx) proves the certificate works.
        $ok = ($res['ok'] ?? false) === true || ($status > 0 && empty($res['error']));
        if (!$ok && $status > 0 && !self::isTlsError((string) ($res['error'] ?? ''))) {
            $ok = true;
        }

        if ($ok) {
            if ($mode !== self::MODE_OFF) {
                self::writeMarker($storage);
            }
        } elseif ($mode === self::MODE_AUTO) {
            self::clearMarker($storage);
        }
        // force: keep marker even if probe fails (shared-hosting loopback often fails)

        $result = [
            'ok' => $ok,
            'marker' => self::hasMarker($storage),
            'mode' => $mode,
            'url' => $url,
            'status' => $status,
        ];
        if (!$ok) {
            $result['error'] = (string) ($res['error'] ?? 'probe_failed');
        }
        self::storeLastProbe($storage, $result);
        return $result;
    }

    /**
     * @param array<string, mixed> $app
     * @return array{
     *   mode: string,
     *   marker: bool,
     *   request_is_https: bool,
     *   force_redirect: bool,
     *   last_probe: ?array<string, mixed>
     * }
     */
    public static function status(?Database $db = null, array $app = [], ?string $storage = null): array
    {
        $storage = self::storageDir($storage ?? (isset($app['storage']) ? (string) $app['storage'] : null));
        $mode = self::mode($storage);
        if ($mode === self::MODE_FORCE && !self::hasMarker($storage)) {
            self::writeMarker($storage);
        }
        if ($mode === self::MODE_OFF && self::hasMarker($storage)) {
            self::clearMarker($storage);
        }

        return [
            'mode' => $mode,
            'marker' => self::hasMarker($storage),
            'request_is_https' => self::requestIsHttps(),
            'force_redirect' => self::hasMarker($storage),
            'last_probe' => self::readLastProbe($storage),
        ];
    }

    /**
     * @param array<string, mixed> $app
     */
    public static function probeUrl(?Database $db, array $app): string
    {
        $origin = PublicOrigin::resolve($db, $app);
        if ($origin === '') {
            $host = (string) ($_SERVER['HTTP_HOST'] ?? '');
            if (!PublicOrigin::isValidHostHeader($host)) {
                return '';
            }
            $origin = 'https://' . PublicOrigin::hostWithoutPort($host);
        }
        $parts = parse_url($origin);
        $host = is_array($parts) ? (string) ($parts['host'] ?? '') : '';
        if ($host === '' || !PublicOrigin::isValidHostHeader($host)) {
            return '';
        }
        $port = is_array($parts) && isset($parts['port']) ? ':' . (int) $parts['port'] : '';
        return 'https://' . strtolower($host) . $port . '/';
    }

    public static function writeMarker(?string $storage = null): bool
    {
        $storage = self::storageDir($storage);
        if (!is_dir($storage)) {
            @mkdir($storage, 0755, true);
        }
        $path = self::markerPath($storage);
        $ok = @file_put_contents($path, date('c') . "\n") !== false;
        return $ok && is_file($path);
    }

    public static function clearMarker(?string $storage = null): void
    {
        $path = self::markerPath($storage);
        if (is_file($path)) {
            @unlink($path);
        }
    }

    private static function isTlsError(string $error): bool
    {
        $e = strtolower($error);
        return str_contains($e, 'ssl')
            || str_contains($e, 'tls')
            || str_contains($e, 'certificate')
            || str_contains($e, 'cert');
    }

    /**
     * @param array<string, mixed> $result
     */
    private static function storeLastProbe(string $storage, array $result): void
    {
        $payload = $result;
        $payload['at'] = date('c');
        @file_put_contents(
            $storage . '/' . self::LAST_PROBE_NAME,
            json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) ?: '{}'
        );
    }

    /**
     * @return array<string, mixed>|null
     */
    private static function readLastProbe(string $storage): ?array
    {
        $path = $storage . '/' . self::LAST_PROBE_NAME;
        if (!is_file($path)) {
            return null;
        }
        $raw = @file_get_contents($path);
        if (!is_string($raw) || $raw === '') {
            return null;
        }
        $decoded = json_decode($raw, true);
        return is_array($decoded) ? $decoded : null;
    }
}
