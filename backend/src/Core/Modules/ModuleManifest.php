<?php
declare(strict_types=1);

namespace App\Core\Modules;

/**
 * Parsed + validated module.json (schema_version 1).
 */
final class ModuleManifest
{
    public const API_VERSION = 1;
    public const SCHEMA_VERSION = 1;

    /** @param array<string, mixed> $data */
    public function __construct(private array $data) {}

    /** @param array<string, mixed> $data */
    public static function fromArray(array $data): self
    {
        return new self($data);
    }

    /** @return array<string, mixed> */
    public function toArray(): array
    {
        return $this->data;
    }

    public function slug(): string
    {
        return (string) ($this->data['slug'] ?? '');
    }

    public function name(): string
    {
        return (string) ($this->data['name'] ?? $this->slug());
    }

    public function version(): string
    {
        return (string) ($this->data['version'] ?? '0.0.0');
    }

    public function description(): string
    {
        return (string) ($this->data['description'] ?? '');
    }

    public function backendEntrypoint(): string
    {
        $ep = $this->data['entrypoints'] ?? [];
        return is_array($ep) ? (string) ($ep['backend'] ?? '') : '';
    }

    public function frontendManifestPath(): ?string
    {
        $ep = $this->data['entrypoints'] ?? [];
        if (!is_array($ep) || empty($ep['frontend_manifest'])) {
            return null;
        }
        return (string) $ep['frontend_manifest'];
    }

    public function migrationsPath(): string
    {
        $m = $this->data['migrations'] ?? [];
        return is_array($m) ? (string) ($m['path'] ?? 'migrations') : 'migrations';
    }

    public function uninstallMigrationsPath(): string
    {
        $m = $this->data['migrations'] ?? [];
        return is_array($m) ? (string) ($m['uninstall_path'] ?? 'migrations/uninstall') : 'migrations/uninstall';
    }

    public function apiVersion(): int
    {
        $j = $this->data['jasefly'] ?? [];
        return is_array($j) ? (int) ($j['api_version'] ?? 0) : 0;
    }

    /** Platform SDK generation required by this package (default 1). */
    public function sdkVersion(): int
    {
        $j = $this->data['jasefly'] ?? [];
        if (!is_array($j)) {
            return 1;
        }
        $v = (int) ($j['sdk_version'] ?? 1);
        return $v > 0 ? $v : 1;
    }

    /** @return list<string> */
    public function requiredCapabilities(): array
    {
        $c = $this->data['capabilities'] ?? [];
        if (!is_array($c)) {
            return [];
        }
        $req = $c['requires'] ?? [];
        if (!is_array($req)) {
            return [];
        }
        return array_values(array_map('strval', $req));
    }

    /** @return list<string> */
    public function providedCapabilities(): array
    {
        $c = $this->data['capabilities'] ?? [];
        if (!is_array($c)) {
            return [];
        }
        $p = $c['provides'] ?? [];
        if (!is_array($p)) {
            return [];
        }
        return array_values(array_map('strval', $p));
    }

    public function minJaseflyVersion(): string
    {
        $j = $this->data['jasefly'] ?? [];
        return is_array($j) ? (string) ($j['min_version'] ?? '0.0.0') : '0.0.0';
    }

    public function maxJaseflyVersion(): ?string
    {
        $j = $this->data['jasefly'] ?? [];
        if (!is_array($j) || !array_key_exists('max_version', $j) || $j['max_version'] === null) {
            return null;
        }
        $v = trim((string) $j['max_version']);
        return $v === '' ? null : $v;
    }

    public function minPhpVersion(): string
    {
        $p = $this->data['php'] ?? [];
        return is_array($p) ? (string) ($p['min_version'] ?? '8.1') : '8.1';
    }

    /** @return list<string> */
    public function phpExtensions(): array
    {
        $p = $this->data['php'] ?? [];
        $ext = is_array($p) ? ($p['extensions'] ?? []) : [];
        if (!is_array($ext)) {
            return [];
        }
        return array_values(array_map('strval', $ext));
    }

    /** @return array<string, string> */
    public function requiredDependencies(): array
    {
        return $this->depMap('required');
    }

    /** @return array<string, string> */
    public function optionalDependencies(): array
    {
        return $this->depMap('optional');
    }

    /** @return array<string, string> */
    public function conflicts(): array
    {
        return $this->depMap('conflicts');
    }

    /** @return list<string> */
    public function permissions(): array
    {
        $perms = $this->data['permissions'] ?? [];
        if (!is_array($perms)) {
            return [];
        }
        return array_values(array_map('strval', $perms));
    }

    /**
     * Host surface declarations (trash/dashboard/sitemap/media/content_acl/schema).
     * @return array<string, mixed>
     */
    public function surfaces(): array
    {
        $s = $this->data['surfaces'] ?? null;
        return is_array($s) ? $s : [];
    }

    public function preserveDataOnUninstall(): bool
    {
        $i = $this->data['install'] ?? [];
        if (!is_array($i)) {
            return true;
        }
        return (bool) ($i['preserve_data_on_uninstall'] ?? true);
    }

    public function allowDowngrade(): bool
    {
        $i = $this->data['install'] ?? [];
        if (!is_array($i)) {
            return false;
        }
        return (bool) ($i['allow_downgrade'] ?? false);
    }

    /** @return array<string, string> */
    public function hooks(): array
    {
        $h = $this->data['hooks'] ?? [];
        if (!is_array($h)) {
            return [];
        }
        $out = [];
        foreach ($h as $k => $v) {
            if (is_string($k) && is_string($v)) {
                $out[$k] = $v;
            }
        }
        return $out;
    }

    /** @return array<string, mixed> */
    public function provides(): array
    {
        $p = $this->data['provides'] ?? [];
        return is_array($p) ? $p : [];
    }

    public function studlySlug(): string
    {
        $parts = preg_split('/[-_]+/', $this->slug()) ?: [];
        $out = '';
        foreach ($parts as $p) {
            $out .= ucfirst(strtolower((string) $p));
        }
        return $out !== '' ? $out : 'Module';
    }

    /** @return array<string, string> */
    private function depMap(string $key): array
    {
        $deps = $this->data['dependencies'] ?? [];
        if (!is_array($deps)) {
            return [];
        }
        $map = $deps[$key] ?? [];
        if (!is_array($map)) {
            return [];
        }
        $out = [];
        foreach ($map as $k => $v) {
            if (is_string($k) && (is_string($v) || is_numeric($v))) {
                $out[$k] = (string) $v;
            }
        }
        return $out;
    }
}
