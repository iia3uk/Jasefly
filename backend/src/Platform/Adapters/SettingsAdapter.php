<?php
declare(strict_types=1);

namespace App\Platform\Adapters;

use App\Database;
use App\Platform\Contracts\PlatformSettingsInterface;

/**
 * Module-scoped settings stored in settings_kv with key prefix module.{slug}.
 */
final class SettingsAdapter implements PlatformSettingsInterface
{
    public function __construct(
        private Database $db,
        private string $moduleSlug = '',
    ) {}

    public function get(string $key, mixed $default = null): mixed
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

    public function set(string $key, mixed $value): void
    {
        $full = $this->ns($key);
        $json = json_encode($value, JSON_UNESCAPED_UNICODE);
        $this->db->run(
            'INSERT INTO settings_kv (setting_key, setting_value) VALUES (?, ?)
             ON DUPLICATE KEY UPDATE setting_value=VALUES(setting_value)',
            [$full, $json]
        );
    }

    public function all(): array
    {
        $prefix = $this->prefix();
        try {
            $rows = $this->db->all(
                'SELECT setting_key, setting_value FROM settings_kv WHERE setting_key LIKE ?',
                [$prefix . '%']
            );
            $out = [];
            $plen = strlen($prefix);
            foreach ($rows as $row) {
                $k = (string) $row['setting_key'];
                $short = substr($k, $plen);
                $decoded = json_decode((string) ($row['setting_value'] ?? ''), true);
                $out[$short] = json_last_error() === JSON_ERROR_NONE ? $decoded : $row['setting_value'];
            }
            return $out;
        } catch (\Throwable) {
            return [];
        }
    }

    private function ns(string $key): string
    {
        $key = ltrim(str_replace('\\', '/', $key), '/');
        if ($key === '' || str_contains($key, '..') || str_contains($key, "\0")) {
            throw new \InvalidArgumentException('Invalid settings key');
        }
        // Reject attempts to write outside module namespace
        if (str_starts_with($key, 'module.') && !str_starts_with($key, $this->prefix())) {
            throw new \InvalidArgumentException('Settings key escapes module namespace');
        }
        if (str_starts_with($key, $this->prefix())) {
            return $key;
        }
        return $this->prefix() . $key;
    }

    private function prefix(): string
    {
        $slug = $this->moduleSlug !== '' ? $this->moduleSlug : '_platform';
        return 'module.' . $slug . '.';
    }
}
