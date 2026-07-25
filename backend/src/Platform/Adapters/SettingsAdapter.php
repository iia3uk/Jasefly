<?php
declare(strict_types=1);

namespace App\Platform\Adapters;

use App\Database;
use App\Platform\Contracts\PlatformSettingsInterface;

final class SettingsAdapter implements PlatformSettingsInterface
{
    public function __construct(private Database $db) {}

    public function get(string $key, mixed $default = null): mixed
    {
        try {
            $row = $this->db->one('SELECT value_json FROM settings WHERE `key`=? LIMIT 1', [$key]);
            if (!$row || !isset($row['value_json'])) {
                return $default;
            }
            $decoded = json_decode((string) $row['value_json'], true);
            return $decoded ?? $default;
        } catch (\Throwable) {
            return $default;
        }
    }

    public function set(string $key, mixed $value): void
    {
        $json = json_encode($value, JSON_UNESCAPED_UNICODE);
        $this->db->run(
            'INSERT INTO settings (`key`, value_json) VALUES (?, ?) ON DUPLICATE KEY UPDATE value_json=VALUES(value_json)',
            [$key, $json]
        );
    }

    public function all(): array
    {
        try {
            $rows = $this->db->all('SELECT `key`, value_json FROM settings');
            $out = [];
            foreach ($rows as $row) {
                $out[(string) $row['key']] = json_decode((string) $row['value_json'], true);
            }
            return $out;
        } catch (\Throwable) {
            return [];
        }
    }
}
