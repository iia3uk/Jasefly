<?php
declare(strict_types=1);

namespace App\Platform\Adapters;

use App\Database;
use App\Platform\Contracts\PlatformSettingsInterface;

/**
 * Module-scoped settings. Canonical SoT: modules.settings JSON on the modules row.
 * settings_kv (module.{slug}.*) is read-only fallback for legacy/adopted values.
 */
final class SettingsAdapter implements PlatformSettingsInterface
{
    public function __construct(
        private Database $db,
        private string $moduleSlug = '',
    ) {}

    public function get(string $key, mixed $default = null): mixed
    {
        $short = $this->shortKey($key);
        $fromModule = $this->readModuleSettings();
        if (array_key_exists($short, $fromModule)) {
            return $fromModule[$short];
        }
        return $this->getFromKv($key, $default);
    }

    public function set(string $key, mixed $value): void
    {
        $short = $this->shortKey($key);
        $cur = $this->readModuleSettings();
        $cur[$short] = $value;
        $this->writeModuleSettings($cur);
        // Non-destructive mirror for legacy settings_kv readers.
        $this->mirrorToKv($short, $value);
    }

    public function all(): array
    {
        $out = $this->readModuleSettings();
        $prefix = $this->prefix();
        try {
            $rows = $this->db->all(
                'SELECT setting_key, setting_value FROM settings_kv WHERE setting_key LIKE ?',
                [$prefix . '%']
            );
            $plen = strlen($prefix);
            foreach ($rows as $row) {
                $k = (string) $row['setting_key'];
                $short = substr($k, $plen);
                if ($short === '' || array_key_exists($short, $out)) {
                    continue;
                }
                $decoded = json_decode((string) ($row['setting_value'] ?? ''), true);
                $out[$short] = json_last_error() === JSON_ERROR_NONE ? $decoded : $row['setting_value'];
            }
        } catch (\Throwable) {
        }
        return $out;
    }

    /** @return array<string, mixed> */
    private function readModuleSettings(): array
    {
        if ($this->moduleSlug === '') {
            return [];
        }
        try {
            $row = $this->db->one('SELECT settings FROM modules WHERE name=? LIMIT 1', [$this->moduleSlug]);
            if (!$row || empty($row['settings'])) {
                return [];
            }
            $decoded = json_decode((string) $row['settings'], true);
            return is_array($decoded) ? $decoded : [];
        } catch (\Throwable) {
            return [];
        }
    }

    /** @param array<string, mixed> $settings */
    private function writeModuleSettings(array $settings): void
    {
        if ($this->moduleSlug === '') {
            throw new \InvalidArgumentException('Module slug required for settings write');
        }
        $json = json_encode($settings, JSON_UNESCAPED_UNICODE);
        try {
            $exists = $this->db->one('SELECT name FROM modules WHERE name=? LIMIT 1', [$this->moduleSlug]);
            if ($exists) {
                $this->db->run('UPDATE modules SET settings=? WHERE name=?', [$json, $this->moduleSlug]);
            } else {
                // Do not force-disable: settings write must not flip plugin mirror off.
                $this->db->run(
                    'INSERT INTO modules (name, is_enabled, settings) VALUES (?, 1, ?)',
                    [$this->moduleSlug, $json]
                );
            }
        } catch (\Throwable $e) {
            throw new \RuntimeException('Failed to persist module settings: ' . $e->getMessage(), 0, $e);
        }
    }

    private function mirrorToKv(string $shortKey, mixed $value): void
    {
        try {
            $full = $this->prefix() . $shortKey;
            $json = json_encode($value, JSON_UNESCAPED_UNICODE);
            $this->db->run(
                'INSERT INTO settings_kv (setting_key, setting_value) VALUES (?, ?)
                 ON DUPLICATE KEY UPDATE setting_value=VALUES(setting_value)',
                [$full, $json]
            );
        } catch (\Throwable) {
            // Legacy table optional on partial installs.
        }
    }

    private function getFromKv(string $key, mixed $default): mixed
    {
        $full = $this->ns($key);
        try {
            $row = $this->db->one(
                'SELECT setting_value FROM settings_kv WHERE setting_key=? LIMIT 1',
                [$full]
            );
            if (!$row || !array_key_exists('setting_value', $row)) {
                return $default;
            }
            $raw = $row['setting_value'];
            if ($raw === null || $raw === '') {
                return $default;
            }
            $decoded = json_decode((string) $raw, true);
            return json_last_error() === JSON_ERROR_NONE ? $decoded : $raw;
        } catch (\Throwable) {
            return $default;
        }
    }

    private function shortKey(string $key): string
    {
        $key = ltrim(str_replace('\\', '/', $key), '/');
        if ($key === '' || str_contains($key, '..') || str_contains($key, "\0")) {
            throw new \InvalidArgumentException('Invalid settings key');
        }
        $prefix = $this->prefix();
        if (str_starts_with($key, $prefix)) {
            return substr($key, strlen($prefix));
        }
        if (str_starts_with($key, 'module.') && !str_starts_with($key, $prefix)) {
            throw new \InvalidArgumentException('Settings key escapes module namespace');
        }
        return $key;
    }

    private function ns(string $key): string
    {
        $short = $this->shortKey($key);
        return $this->prefix() . $short;
    }

    private function prefix(): string
    {
        $slug = $this->moduleSlug !== '' ? $this->moduleSlug : '_platform';
        return 'module.' . $slug . '.';
    }
}
