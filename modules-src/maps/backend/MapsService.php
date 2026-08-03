<?php
declare(strict_types=1);

namespace App\PackageModules\Maps;

use App\Platform\Contracts\PlatformDatabaseInterface;

final class MapsService
{
    public function __construct(private readonly PlatformDatabaseInterface $db)
    {
    }

    /** @return array<string, mixed> */
    public function getSettings(): array
    {
        try {
            $row = $this->db->one('SELECT * FROM maps_settings WHERE id = 1');
        } catch (\Throwable) {
            $row = null;
        }
        if (!is_array($row)) {
            return $this->defaults();
        }
        return [
            'provider' => (string) ($row['provider'] ?? 'yandex'),
            'api_key' => (string) ($row['api_key'] ?? ''),
            'locale' => (string) ($row['locale'] ?? 'ru'),
            'map_style' => (string) ($row['map_style'] ?? 'default'),
            'default_lat' => (float) ($row['default_lat'] ?? 55.7558),
            'default_lng' => (float) ($row['default_lng'] ?? 37.6173),
            'default_zoom' => (int) ($row['default_zoom'] ?? 12),
            'fallback_title' => (string) ($row['fallback_title'] ?? 'Карта недоступна'),
            'fallback_hint' => (string) ($row['fallback_hint'] ?? 'Не удалось загрузить карту. Откройте маршрут во внешнем сервисе.'),
            'updated_at' => $row['updated_at'] ?? null,
        ];
    }

    /**
     * @param array<string, mixed> $input
     * @return array<string, mixed>
     */
    public function saveSettings(array $input): array
    {
        $cur = $this->getSettings();
        $provider = $this->sanitizeProvider((string) ($input['provider'] ?? $cur['provider']));
        $apiKey = mb_substr(trim((string) ($input['api_key'] ?? $cur['api_key'])), 0, 255);
        $locale = mb_substr(trim((string) ($input['locale'] ?? $cur['locale'])), 0, 16);
        if ($locale === '') {
            $locale = 'ru';
        }
        $mapStyle = mb_substr(trim((string) ($input['map_style'] ?? $cur['map_style'])), 0, 64);
        if ($mapStyle === '') {
            $mapStyle = 'default';
        }
        $lat = $this->clampLat(isset($input['default_lat']) ? (float) $input['default_lat'] : (float) $cur['default_lat']);
        $lng = $this->clampLng(isset($input['default_lng']) ? (float) $input['default_lng'] : (float) $cur['default_lng']);
        $zoom = (int) ($input['default_zoom'] ?? $cur['default_zoom']);
        if ($zoom < 1) {
            $zoom = 1;
        }
        if ($zoom > 20) {
            $zoom = 20;
        }
        $fallbackTitle = mb_substr(trim((string) ($input['fallback_title'] ?? $cur['fallback_title'])), 0, 190);
        $fallbackHint = mb_substr(trim((string) ($input['fallback_hint'] ?? $cur['fallback_hint'])), 0, 500);

        $now = gmdate('Y-m-d H:i:s');
        $params = [$provider, $apiKey, $locale, $mapStyle, $lat, $lng, $zoom, $fallbackTitle, $fallbackHint, $now];
        try {
            $exists = $this->db->one('SELECT id FROM maps_settings WHERE id = 1');
        } catch (\Throwable) {
            $exists = null;
        }
        if ($exists) {
            $this->db->run(
                'UPDATE maps_settings SET provider=?, api_key=?, locale=?, map_style=?, default_lat=?, default_lng=?, default_zoom=?, fallback_title=?, fallback_hint=?, updated_at=? WHERE id=1',
                $params
            );
        } else {
            $this->db->run(
                'INSERT INTO maps_settings (id, provider, api_key, locale, map_style, default_lat, default_lng, default_zoom, fallback_title, fallback_hint, created_at, updated_at)
                 VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                [...$params, $now]
            );
        }

        return $this->getSettings();
    }

    /** @return array<string, mixed> */
    public function publicConfig(): array
    {
        $s = $this->getSettings();
        return [
            'provider' => $s['provider'],
            'locale' => $s['locale'],
            'map_style' => $s['map_style'],
            'default_lat' => $s['default_lat'],
            'default_lng' => $s['default_lng'],
            'default_zoom' => $s['default_zoom'],
            'fallback_title' => $s['fallback_title'],
            'fallback_hint' => $s['fallback_hint'],
            // api_key intentionally omitted from public
        ];
    }

    /** @return array<string, mixed> */
    public function ping(): array
    {
        return [
            'ok' => true,
            'module' => 'maps',
            'provider' => $this->getSettings()['provider'],
            'time' => gmdate(DATE_ATOM),
        ];
    }

    /** @return array<string, mixed> */
    private function defaults(): array
    {
        return [
            'provider' => 'yandex',
            'api_key' => '',
            'locale' => 'ru',
            'map_style' => 'default',
            'default_lat' => 55.7539,
            'default_lng' => 37.6208,
            'default_zoom' => 12,
            'fallback_title' => 'Карта недоступна',
            'fallback_hint' => 'Не удалось загрузить карту. Откройте маршрут во внешнем сервисе.',
            'updated_at' => null,
        ];
    }

    private function sanitizeProvider(string $provider): string
    {
        $p = strtolower(trim($provider));
        if ($p === '') {
            return 'yandex';
        }
        // Future: google, mapbox — accept id without enabling adapter yet
        if (!preg_match('/^[a-z0-9_-]{1,64}$/', $p)) {
            return 'yandex';
        }
        return $p;
    }

    private function clampLat(float $lat): float
    {
        if ($lat < -90) {
            return -90.0;
        }
        if ($lat > 90) {
            return 90.0;
        }
        return $lat;
    }

    private function clampLng(float $lng): float
    {
        if ($lng < -180) {
            return -180.0;
        }
        if ($lng > 180) {
            return 180.0;
        }
        return $lng;
    }
}
