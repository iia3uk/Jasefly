<?php
declare(strict_types=1);

namespace App\PackageModules\CookieConsent;

use App\Platform\Contracts\PlatformDatabaseInterface;

final class ConsentService
{
    public function __construct(private PlatformDatabaseInterface $db) {}

    /** @return array<string, mixed> */
    public function getSettings(): array
    {
        $defaults = $this->defaultSettings();
        try {
            $row = $this->db->one('SELECT * FROM cookie_consent_settings WHERE id=1');
        } catch (\Throwable) {
            return $defaults;
        }
        if (!$row) {
            return $defaults;
        }
        return [
            'enabled' => (int) ($row['enabled'] ?? 1),
            'policy_version' => (string) ($row['policy_version'] ?? '1'),
            'policy_href' => (string) ($row['policy_href'] ?? '/privacy'),
            'banner_title' => (string) ($row['banner_title'] ?? 'Файлы cookie'),
            'banner_text' => (string) ($row['banner_text'] ?? ''),
            'modal_text' => (string) ($row['modal_text'] ?? ''),
            'categories' => $this->decodeJsonList($row['categories_json'] ?? null, $defaults['categories']),
            'providers' => $this->decodeJsonList($row['providers_json'] ?? null, []),
            'show_floating_widget' => (int) ($row['show_floating_widget'] ?? 1),
            'log_retention_days' => (int) ($row['log_retention_days'] ?? 365),
            'presets' => ProviderPresets::all(),
            'updated_at' => $row['updated_at'] ?? null,
        ];
    }

    /** @param array<string, mixed> $data */
    public function saveSettings(array $data): array
    {
        $prev = $this->getSettings();
        $enabled = array_key_exists('enabled', $data) ? (int) ((bool) $data['enabled']) : (int) $prev['enabled'];
        $policyVersion = isset($data['policy_version'])
            ? mb_substr(trim((string) $data['policy_version']), 0, 32)
            : (string) $prev['policy_version'];
        if ($policyVersion === '') {
            $policyVersion = '1';
        }
        $policyHref = isset($data['policy_href'])
            ? mb_substr(trim((string) $data['policy_href']), 0, 255)
            : (string) $prev['policy_href'];
        $bannerTitle = isset($data['banner_title'])
            ? mb_substr(trim((string) $data['banner_title']), 0, 255)
            : (string) $prev['banner_title'];
        $bannerText = isset($data['banner_text']) ? (string) $data['banner_text'] : (string) $prev['banner_text'];
        $modalText = isset($data['modal_text']) ? (string) $data['modal_text'] : (string) $prev['modal_text'];
        $categories = $data['categories'] ?? $prev['categories'];
        if (!is_array($categories)) {
            $categories = $prev['categories'];
        }
        $providers = $data['providers'] ?? $prev['providers'];
        if (!is_array($providers)) {
            $providers = [];
        }
        $showWidget = array_key_exists('show_floating_widget', $data)
            ? (int) ((bool) $data['show_floating_widget'])
            : (int) $prev['show_floating_widget'];
        $retention = array_key_exists('log_retention_days', $data)
            ? max(30, min(3650, (int) $data['log_retention_days']))
            : (int) $prev['log_retention_days'];

        $now = gmdate('Y-m-d H:i:s');
        $catJson = json_encode(array_values($categories), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        $provJson = json_encode(array_values($providers), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);

        $exists = $this->db->one('SELECT id FROM cookie_consent_settings WHERE id=1');
        if ($exists) {
            $this->db->run(
                'UPDATE cookie_consent_settings SET enabled=?, policy_version=?, policy_href=?, banner_title=?,
                 banner_text=?, modal_text=?, categories_json=?, providers_json=?, show_floating_widget=?,
                 log_retention_days=?, updated_at=? WHERE id=1',
                [$enabled, $policyVersion, $policyHref, $bannerTitle, $bannerText, $modalText, $catJson, $provJson, $showWidget, $retention, $now]
            );
        } else {
            $this->db->run(
                'INSERT INTO cookie_consent_settings
                 (id, enabled, policy_version, policy_href, banner_title, banner_text, modal_text,
                  categories_json, providers_json, show_floating_widget, log_retention_days, created_at, updated_at)
                 VALUES (1,?,?,?,?,?,?,?,?,?,?,?,?)',
                [$enabled, $policyVersion, $policyHref, $bannerTitle, $bannerText, $modalText, $catJson, $provJson, $showWidget, $retention, $now, $now]
            );
        }
        return $this->getSettings();
    }

    /**
     * Public config for FE gate (no secrets).
     * @return array<string, mixed>
     */
    public function publicConfig(): array
    {
        $s = $this->getSettings();
        return [
            'enabled' => (int) $s['enabled'],
            'policy_version' => $s['policy_version'],
            'policy_href' => $s['policy_href'],
            'banner_title' => $s['banner_title'],
            'banner_text' => $s['banner_text'],
            'modal_text' => $s['modal_text'],
            'categories' => $s['categories'],
            'providers' => $s['providers'],
            'show_floating_widget' => (int) $s['show_floating_widget'],
            'presets' => ProviderPresets::all(),
            'module' => 'cookie-consent',
        ];
    }

    /**
     * @param array<string, mixed> $categories map id => bool
     * @return array{ok: bool, id: int|null}
     */
    public function logConsent(
        array $categories,
        string $source,
        string $policyVersion,
        string $visitorKey = '',
        ?string $userAgent = null,
        ?string $ip = null,
    ): array {
        $source = mb_substr(preg_replace('/[^a-z0-9_-]/i', '', $source) ?: 'banner', 0, 32);
        $policyVersion = mb_substr($policyVersion !== '' ? $policyVersion : '1', 0, 32);
        $visitorKey = mb_substr($visitorKey, 0, 64);
        $ua = $userAgent !== null ? mb_substr($userAgent, 0, 512) : null;
        $ipHash = null;
        if ($ip !== null && $ip !== '') {
            $ipHash = hash('sha256', $ip . '|cookie-consent');
        }
        $json = json_encode($categories, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        try {
            $this->db->run(
                'INSERT INTO cookie_consent_log (visitor_key, source, policy_version, categories_json, user_agent, ip_hash, created_at)
                 VALUES (?,?,?,?,?,?,?)',
                [$visitorKey, $source, $policyVersion, $json, $ua, $ipHash, gmdate('Y-m-d H:i:s')]
            );
            $row = $this->db->one('SELECT id FROM cookie_consent_log ORDER BY id DESC LIMIT 1');
            return ['ok' => true, 'id' => $row ? (int) $row['id'] : null];
        } catch (\Throwable) {
            return ['ok' => false, 'id' => null];
        }
    }

    /** @return list<array<string, mixed>> */
    public function listLog(int $limit = 100, int $offset = 0): array
    {
        try {
            return $this->db->all(
                'SELECT id, visitor_key, source, policy_version, categories_json, created_at
                 FROM cookie_consent_log ORDER BY id DESC LIMIT ? OFFSET ?',
                [max(1, min(500, $limit)), max(0, $offset)]
            );
        } catch (\Throwable) {
            return [];
        }
    }

    /** @return array{total: int, by_source: list<array{source: string, cnt: int}>, recent_days: list<array{day: string, cnt: int}>} */
    public function stats(): array
    {
        $total = 0;
        $bySource = [];
        $recent = [];
        try {
            $row = $this->db->one('SELECT COUNT(*) AS c FROM cookie_consent_log');
            $total = (int) ($row['c'] ?? 0);
            $bySource = $this->db->all(
                'SELECT source, COUNT(*) AS cnt FROM cookie_consent_log GROUP BY source ORDER BY cnt DESC'
            );
            $recent = $this->db->all(
                'SELECT DATE(created_at) AS day, COUNT(*) AS cnt FROM cookie_consent_log
                 WHERE created_at >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL 30 DAY)
                 GROUP BY DATE(created_at) ORDER BY day ASC'
            );
        } catch (\Throwable) {
        }
        return [
            'total' => $total,
            'by_source' => $bySource,
            'recent_days' => $recent,
        ];
    }

    public function exportCsv(): string
    {
        $rows = $this->listLog(5000, 0);
        $out = "id,created_at,source,policy_version,visitor_key,categories\n";
        foreach ($rows as $r) {
            $cats = $r['categories_json'] ?? '';
            if (is_array($cats)) {
                $cats = json_encode($cats, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
            }
            $out .= sprintf(
                "%s,%s,%s,%s,%s,\"%s\"\n",
                $r['id'] ?? '',
                $r['created_at'] ?? '',
                $this->csvEscape((string) ($r['source'] ?? '')),
                $this->csvEscape((string) ($r['policy_version'] ?? '')),
                $this->csvEscape((string) ($r['visitor_key'] ?? '')),
                str_replace('"', '""', (string) $cats)
            );
        }
        return $out;
    }

    /** Simple XLSX-compatible SpreadsheetML (Excel opens it). */
    public function exportXlsxXml(): string
    {
        $rows = $this->listLog(5000, 0);
        $xml = '<?xml version="1.0" encoding="UTF-8"?>'
            . '<?mso-application progid="Excel.Sheet"?>'
            . '<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"'
            . ' xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">'
            . '<Worksheet ss:Name="consents"><Table>';
        $xml .= $this->xlsRow(['id', 'created_at', 'source', 'policy_version', 'visitor_key', 'categories']);
        foreach ($rows as $r) {
            $cats = $r['categories_json'] ?? '';
            if (is_array($cats)) {
                $cats = json_encode($cats, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
            }
            $xml .= $this->xlsRow([
                (string) ($r['id'] ?? ''),
                (string) ($r['created_at'] ?? ''),
                (string) ($r['source'] ?? ''),
                (string) ($r['policy_version'] ?? ''),
                (string) ($r['visitor_key'] ?? ''),
                (string) $cats,
            ]);
        }
        $xml .= '</Table></Worksheet></Workbook>';
        return $xml;
    }

    /** @return array{deleted: int} */
    public function purgeOldLogs(?int $days = null): array
    {
        $s = $this->getSettings();
        $days = $days ?? (int) $s['log_retention_days'];
        $days = max(30, min(3650, $days));
        try {
            $this->db->run(
                'DELETE FROM cookie_consent_log WHERE created_at < DATE_SUB(UTC_TIMESTAMP(), INTERVAL ? DAY)',
                [$days]
            );
            return ['deleted' => 1];
        } catch (\Throwable) {
            return ['deleted' => 0];
        }
    }

    /** @return array<string, mixed> */
    private function defaultSettings(): array
    {
        return [
            'enabled' => 1,
            'policy_version' => '1',
            'policy_href' => '/privacy',
            'banner_title' => 'Файлы cookie',
            'banner_text' => 'Мы используем необходимые cookie для работы сайта. Аналитика и маркетинг — только с вашего согласия.',
            'modal_text' => 'Выберите категории cookie. Необходимые всегда включены.',
            'categories' => [
                ['id' => 'necessary', 'label' => 'Необходимые', 'description' => 'Авторизация, безопасность, настройки', 'required' => true, 'default' => true],
                ['id' => 'analytics', 'label' => 'Аналитика', 'description' => 'Счётчики посещаемости', 'required' => false, 'default' => false],
                ['id' => 'marketing', 'label' => 'Маркетинг', 'description' => 'Реклама и ретаргетинг', 'required' => false, 'default' => false],
            ],
            'providers' => [],
            'show_floating_widget' => 1,
            'log_retention_days' => 365,
            'presets' => ProviderPresets::all(),
        ];
    }

    /**
     * @param list<mixed> $fallback
     * @return list<mixed>
     */
    private function decodeJsonList(mixed $raw, array $fallback): array
    {
        if (is_string($raw) && $raw !== '') {
            $decoded = json_decode($raw, true);
            if (is_array($decoded)) {
                return array_values($decoded);
            }
        }
        if (is_array($raw)) {
            return array_values($raw);
        }
        return $fallback;
    }

    private function csvEscape(string $v): string
    {
        if (str_contains($v, ',') || str_contains($v, '"') || str_contains($v, "\n")) {
            return '"' . str_replace('"', '""', $v) . '"';
        }
        return $v;
    }

    /** @param list<string> $cells */
    private function xlsRow(array $cells): string
    {
        $row = '<Row>';
        foreach ($cells as $c) {
            $safe = htmlspecialchars($c, ENT_XML1 | ENT_QUOTES, 'UTF-8');
            $row .= '<Cell><Data ss:Type="String">' . $safe . '</Data></Cell>';
        }
        return $row . '</Row>';
    }
}
