<?php
declare(strict_types=1);

namespace App\PackageModules\Indexnow;

use App\Platform\Contracts\PlatformDatabaseInterface;
use App\Platform\PlatformContext;

final class IndexNowService
{
    /** Min seconds between HTTP calls to the same rate-limit group. */
    private const ENDPOINT_MIN_INTERVAL = 90;

    /** After HTTP 429, skip the group for this many seconds (or Retry-After if larger). */
    private const COOLDOWN_429 = 3600;

    /** Do not re-notify the same URL within this window (IndexNow FAQ ≈ 10 min). */
    private const URL_RESUBMIT_COOLDOWN = 900;

    /** Auto-submit debounce: ignore bursts of content events. */
    private const AUTO_DEBOUNCE = 45;

    /** Prefer Bing direct; hub shares the same Bing quota — never both. */
    private const DEFAULT_ENDPOINTS = [
        'https://www.bing.com/indexnow',
        'https://yandex.com/indexnow',
        'https://search.seznam.cz/indexnow',
    ];

    public function __construct(
        private PlatformDatabaseInterface $db,
        private PlatformContext $ctx,
    ) {}

    /** @return array<string, mixed> */
    public function getSettings(): array
    {
        $defaults = [
            'api_key' => '',
            'host' => '',
            // Google does NOT support IndexNow. Bing + hub share one quota — hub omitted.
            'endpoints' => self::DEFAULT_ENDPOINTS,
            'auto_submit' => 1,
            'key_file_ok' => 0,
            'key_file_url' => '',
            'site_origin' => $this->siteOrigin(),
        ];
        try {
            $row = $this->db->one('SELECT * FROM indexnow_settings WHERE id=1');
        } catch (\Throwable) {
            return $defaults;
        }
        if (!$row) {
            return $defaults;
        }
        $endpoints = $defaults['endpoints'];
        $raw = $row['endpoints_json'] ?? null;
        if (is_string($raw) && $raw !== '') {
            $decoded = json_decode($raw, true);
            if (is_array($decoded) && $decoded !== []) {
                $endpoints = array_values(array_filter(array_map('strval', $decoded)));
            }
        }
        $key = (string) ($row['api_key'] ?? '');
        $host = (string) ($row['host'] ?? '');
        if ($host === '') {
            $host = $this->urlResolver()->host();
        }
        $origin = $this->siteOrigin();
        return [
            'api_key' => $key,
            'host' => $host,
            'endpoints' => $endpoints,
            'auto_submit' => (int) ($row['auto_submit'] ?? 1),
            'key_file_ok' => (int) ($row['key_file_ok'] ?? 0),
            'key_file_url' => $key !== '' && $origin !== '' ? ($origin . '/' . $key . '.txt') : '',
            'site_origin' => $origin,
            'updated_at' => $row['updated_at'] ?? null,
        ];
    }

    /** @param array<string, mixed> $data */
    public function saveSettings(array $data): array
    {
        $prev = $this->getSettings();
        if (array_key_exists('api_key', $data)) {
            $rawKey = trim((string) $data['api_key']);
            if ($rawKey !== '' && !preg_match('/^[a-zA-Z0-9-]{8,128}$/', $rawKey)) {
                throw new \InvalidArgumentException('Ключ IndexNow: 8–128 символов (a-z, A-Z, 0-9, -), UTF-8');
            }
            $key = $rawKey;
        } else {
            $key = (string) ($prev['api_key'] ?? '');
        }
        $host = isset($data['host']) ? trim((string) $data['host']) : (string) ($prev['host'] ?? '');
        if ($host === '') {
            $host = $this->urlResolver()->host();
        }
        $host = preg_replace('#^https?://#i', '', $host) ?? $host;
        $host = rtrim($host, '/');

        $endpoints = $data['endpoints'] ?? $prev['endpoints'] ?? [];
        if (is_string($endpoints)) {
            $endpoints = preg_split('/\R+/', $endpoints) ?: [];
        }
        if (!is_array($endpoints)) {
            $endpoints = [];
        }
        $endpoints = array_values(array_unique(array_filter(array_map(
            static fn($e) => trim((string) $e),
            $endpoints
        ), static fn($e) => $e !== '' && str_starts_with($e, 'http'))));
        $endpoints = $this->dedupeEndpointGroups($endpoints);
        if ($endpoints === []) {
            $endpoints = self::DEFAULT_ENDPOINTS;
        }

        $auto = array_key_exists('auto_submit', $data)
            ? ((int) ((bool) $data['auto_submit']))
            : (int) ($prev['auto_submit'] ?? 1);

        $oldKey = (string) ($prev['api_key'] ?? '');
        if ($oldKey !== '' && $oldKey !== $key) {
            $this->removeKeyFile($oldKey);
        }

        $keyFileOk = 0;
        if ($key !== '') {
            $keyFileOk = $this->placeKeyFile($key) ? 1 : 0;
        }

        $now = gmdate('Y-m-d H:i:s');
        $endpointsJson = json_encode($endpoints, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        try {
            $exists = $this->db->one('SELECT id FROM indexnow_settings WHERE id=1');
            if ($exists) {
                $this->db->run(
                    'UPDATE indexnow_settings SET api_key=?, host=?, endpoints_json=?, auto_submit=?, key_file_ok=?, updated_at=? WHERE id=1',
                    [$key, $host, $endpointsJson, $auto, $keyFileOk, $now]
                );
            } else {
                $this->db->run(
                    'INSERT INTO indexnow_settings (id, api_key, host, endpoints_json, auto_submit, key_file_ok, created_at, updated_at)
                     VALUES (1,?,?,?,?,?,?,?)',
                    [$key, $host, $endpointsJson, $auto, $keyFileOk, $now, $now]
                );
            }
        } catch (\Throwable $e) {
            throw $e;
        }

        return $this->getSettings();
    }

    public function generateKey(): string
    {
        $alphabet = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-';
        $len = 32;
        $out = '';
        for ($i = 0; $i < $len; $i++) {
            $out .= $alphabet[random_int(0, strlen($alphabet) - 1)];
        }
        return $out;
    }

    /**
     * One-click: ensure host, create key if missing, write verification file.
     * @return array{settings: array<string, mixed>, status: array<string, mixed>}
     */
    public function quickSetup(): array
    {
        $prev = $this->getSettings();
        $key = (string) ($prev['api_key'] ?? '');
        if ($key === '') {
            $key = $this->generateKey();
        }
        $host = (string) ($prev['host'] ?? '');
        if ($host === '') {
            $host = $this->urlResolver()->host();
        }
        $settings = $this->saveSettings([
            'api_key' => $key,
            'host' => $host,
            'auto_submit' => (int) ($prev['auto_submit'] ?? 1),
            'endpoints' => $prev['endpoints'] ?? [],
        ]);
        return [
            'settings' => $settings,
            'status' => $this->status(),
        ];
    }

    public function placeKeyFile(string $key): bool
    {
        $key = $this->sanitizeKey($key);
        if ($key === '') {
            return false;
        }
        $root = $this->webRoot();
        if ($root === '' || !is_dir($root) || !is_writable($root)) {
            return false;
        }
        $path = $root . DIRECTORY_SEPARATOR . $key . '.txt';
        $ok = @file_put_contents($path, $key) !== false;
        if ($ok) {
            try {
                $this->db->run('UPDATE indexnow_settings SET key_file_ok=1, updated_at=? WHERE id=1', [gmdate('Y-m-d H:i:s')]);
            } catch (\Throwable) {
            }
        }
        return $ok;
    }

    public function removeKeyFile(string $key): void
    {
        $key = $this->sanitizeKey($key);
        if ($key === '') {
            return;
        }
        $root = $this->webRoot();
        if ($root === '') {
            return;
        }
        $path = $root . DIRECTORY_SEPARATOR . $key . '.txt';
        if (is_file($path)) {
            @unlink($path);
        }
    }

    /**
     * @param list<string>|null $urls
     * @return array{ok: bool, results: list<array<string, mixed>>, submitted: int, skipped?: list<array<string, mixed>>, error?: string}
     */
    public function submit(?array $urls = null, string $source = 'manual'): array
    {
        $settings = $this->getSettings();
        $key = (string) ($settings['api_key'] ?? '');
        $host = (string) ($settings['host'] ?? '');
        if ($key === '' || $host === '') {
            return ['ok' => false, 'results' => [], 'submitted' => 0, 'error' => 'key_or_host_missing'];
        }

        if ($urls === null) {
            $urls = $this->urlResolver()->collectPublished(500);
        }
        $urls = $this->normalizeUrls($urls, $host);
        if ($urls === []) {
            return ['ok' => false, 'results' => [], 'submitted' => 0, 'error' => 'no_urls'];
        }

        $isAuto = str_starts_with($source, 'auto:');
        if ($isAuto && $this->recentAutoSubmitWithin(self::AUTO_DEBOUNCE)) {
            return [
                'ok' => true,
                'results' => [],
                'submitted' => 0,
                'skipped' => [['reason' => 'auto_debounce', 'seconds' => self::AUTO_DEBOUNCE]],
            ];
        }

        // Never re-spam the same URLs (auto always; manual/submit-all also — prevents 429 loops).
        $fresh = $this->filterUrlsNotRecentlySubmitted($urls, self::URL_RESUBMIT_COOLDOWN);
        if ($fresh === []) {
            return [
                'ok' => true,
                'results' => [],
                'submitted' => 0,
                'skipped' => [['reason' => 'url_cooldown', 'seconds' => self::URL_RESUBMIT_COOLDOWN, 'urls' => count($urls)]],
            ];
        }
        $urls = $fresh;

        $endpoints = $this->dedupeEndpointGroups(array_map('strval', (array) ($settings['endpoints'] ?? [])));
        $keyLocation = (string) ($settings['key_file_url'] ?? '');
        $client = new IndexNowClient();
        $results = [];
        $skipped = [];
        $anyOk = false;
        $groupsHit = [];

        foreach ($endpoints as $endpoint) {
            $endpoint = trim($endpoint);
            if ($endpoint === '') {
                continue;
            }
            $group = $this->rateLimitGroup($endpoint);
            if (isset($groupsHit[$group])) {
                $skipped[] = ['endpoint' => $endpoint, 'reason' => 'duplicate_group', 'group' => $group];
                continue;
            }

            $cooldownLeft = $this->groupCooldownRemaining($group);
            if ($cooldownLeft > 0) {
                $skipped[] = [
                    'endpoint' => $endpoint,
                    'reason' => 'cooldown_429',
                    'group' => $group,
                    'retry_in' => $cooldownLeft,
                ];
                continue;
            }

            $gapLeft = $this->groupMinIntervalRemaining($group);
            if ($gapLeft > 0) {
                $skipped[] = [
                    'endpoint' => $endpoint,
                    'reason' => 'min_interval',
                    'group' => $group,
                    'retry_in' => $gapLeft,
                ];
                continue;
            }

            $res = $client->submit($endpoint, $host, $key, $urls, $keyLocation !== '' ? $keyLocation : null);
            $this->logSubmission($endpoint, $urls, $res, $source);
            $groupsHit[$group] = true;

            $row = [
                'endpoint' => $endpoint,
                'ok' => $res['ok'],
                'status' => $res['status'],
                'body' => $res['body'],
                'error' => $res['error'] ?? null,
            ];
            if ((int) ($res['status'] ?? 0) === 429) {
                $ra = isset($res['retry_after']) && is_int($res['retry_after'])
                    ? $res['retry_after']
                    : self::COOLDOWN_429;
                $row['cooldown_seconds'] = max(self::COOLDOWN_429, $ra);
            }
            $results[] = $row;
            if ($res['ok']) {
                $anyOk = true;
            }
        }

        return [
            'ok' => $anyOk || ($results === [] && $skipped !== []),
            'results' => $results,
            'submitted' => $results === [] ? 0 : count($urls),
            'skipped' => $skipped,
        ];
    }

    /** @param array<string, mixed> $payload */
    public function onContentEvent(string $event, array $payload): void
    {
        $settings = $this->getSettings();
        if (!(int) ($settings['auto_submit'] ?? 0)) {
            return;
        }
        if ((string) ($settings['api_key'] ?? '') === '') {
            return;
        }
        $urls = $this->urlResolver()->urlsFromEvent($event, $payload);
        if ($urls === []) {
            return;
        }
        // Skip drafts: only auto-submit published-ish saves.
        $data = is_array($payload['data'] ?? null) ? $payload['data'] : [];
        $status = (string) ($data['status'] ?? $payload['status'] ?? '');
        if ($event === 'resource.afterSave' && $status !== '' && $status !== 'published') {
            return;
        }
        $this->submit($urls, 'auto:' . $event);
    }

    /** @return list<array<string, mixed>> */
    public function listLog(int $limit = 50): array
    {
        try {
            return $this->db->all(
                'SELECT id, endpoint, http_status, url_count, urls_json, response_body, ok, source, created_at
                 FROM indexnow_log ORDER BY id DESC LIMIT ?',
                [max(1, min(200, $limit))]
            );
        } catch (\Throwable) {
            return [];
        }
    }

    public function clearLog(): void
    {
        try {
            $this->db->run('DELETE FROM indexnow_log');
        } catch (\Throwable) {
        }
    }

    /** @return array<string, mixed> */
    public function status(): array
    {
        $s = $this->getSettings();
        $key = (string) ($s['api_key'] ?? '');
        $root = $this->webRoot();
        $filePath = ($key !== '' && $root !== '') ? ($root . DIRECTORY_SEPARATOR . $key . '.txt') : '';
        $fileExists = $filePath !== '' && is_file($filePath);
        $fileContentOk = false;
        if ($fileExists) {
            $fileContentOk = trim((string) @file_get_contents($filePath)) === $key;
        }
        return [
            'settings' => $s,
            'web_root' => $root,
            'key_file_path' => $filePath,
            'key_file_exists' => $fileExists,
            'key_file_content_ok' => $fileContentOk,
            'ready' => $key !== '' && (string) ($s['host'] ?? '') !== '' && $fileContentOk,
        ];
    }

    private function urlResolver(): UrlResolver
    {
        return new UrlResolver($this->db, $this->siteOrigin());
    }

    private function siteOrigin(): string
    {
        $url = (string) ($this->ctx->config()->get('url') ?? '');
        if ($url === '' && isset($_SERVER['HTTP_HOST'])) {
            $https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
                || ((int) ($_SERVER['SERVER_PORT'] ?? 0) === 443);
            $url = ($https ? 'https' : 'http') . '://' . $_SERVER['HTTP_HOST'];
        }
        return rtrim($url, '/');
    }

    private function webRoot(): string
    {
        $storage = (string) ($this->ctx->config()->get('storage') ?? '');
        $candidates = [];
        if ($storage !== '') {
            $apiRoot = dirname($storage);
            $parent = dirname($apiRoot);
            $candidates[] = $parent;
            $candidates[] = $apiRoot;
            if (basename($apiRoot) === 'api') {
                $candidates[] = $parent;
            }
        }
        // Document root when PHP runs under public_html
        if (!empty($_SERVER['DOCUMENT_ROOT'])) {
            $candidates[] = (string) $_SERVER['DOCUMENT_ROOT'];
        }
        foreach ($candidates as $root) {
            $root = rtrim(str_replace(['/', '\\'], DIRECTORY_SEPARATOR, $root), DIRECTORY_SEPARATOR);
            if ($root !== '' && is_dir($root) && is_writable($root)) {
                return $root;
            }
        }
        // Prefer parent of api/ even if not yet writable (status reports path)
        if ($storage !== '') {
            $apiRoot = dirname($storage);
            $parent = dirname($apiRoot);
            if (
                is_file($parent . DIRECTORY_SEPARATOR . 'index.php')
                || is_file($parent . DIRECTORY_SEPARATOR . 'index.html')
                || is_file($parent . DIRECTORY_SEPARATOR . 'spa.html')
                || basename($apiRoot) === 'api'
            ) {
                return $parent;
            }
            return $apiRoot;
        }
        return '';
    }

    private function sanitizeKey(string $key): string
    {
        $key = trim($key);
        if ($key === '') {
            return '';
        }
        if (!preg_match('/^[a-zA-Z0-9-]{8,128}$/', $key)) {
            return '';
        }
        return $key;
    }

    /**
     * Bing direct + api.indexnow.org share one quota — keep one endpoint per group.
     *
     * @param list<string> $endpoints
     * @return list<string>
     */
    private function dedupeEndpointGroups(array $endpoints): array
    {
        $out = [];
        $seen = [];
        foreach ($endpoints as $endpoint) {
            $endpoint = trim((string) $endpoint);
            if ($endpoint === '' || !str_starts_with($endpoint, 'http')) {
                continue;
            }
            $group = $this->rateLimitGroup($endpoint);
            if (isset($seen[$group])) {
                continue;
            }
            // Prefer bing.com over hub when both appear (hub is weaker under load).
            $seen[$group] = true;
            $out[] = $endpoint;
        }
        // If hub won the race before bing in the list, swap preference on save:
        // rebuild: if group bing has hub only, leave; if both in input, prefer bing.com
        $hasBingDirect = false;
        $hasHub = false;
        foreach ($endpoints as $e) {
            $h = strtolower((string) (parse_url(trim((string) $e), PHP_URL_HOST) ?? ''));
            if ($h === 'www.bing.com' || $h === 'bing.com') {
                $hasBingDirect = true;
            }
            if ($h === 'api.indexnow.org') {
                $hasHub = true;
            }
        }
        if ($hasBingDirect && $hasHub) {
            $out = array_values(array_filter(
                $out,
                static function (string $e): bool {
                    $h = strtolower((string) (parse_url($e, PHP_URL_HOST) ?? ''));
                    return $h !== 'api.indexnow.org';
                }
            ));
        }
        return $out;
    }

    private function rateLimitGroup(string $endpoint): string
    {
        $host = strtolower((string) (parse_url($endpoint, PHP_URL_HOST) ?? ''));
        if ($host === 'www.bing.com' || $host === 'bing.com' || $host === 'api.indexnow.org') {
            return 'bing';
        }
        if ($host === 'yandex.com' || $host === 'yandex.ru' || str_ends_with($host, '.yandex.com')) {
            return 'yandex';
        }
        return $host !== '' ? $host : $endpoint;
    }

    private function groupCooldownRemaining(string $group): int
    {
        try {
            $rows = $this->db->all(
                'SELECT endpoint, http_status, created_at, response_body
                 FROM indexnow_log
                 WHERE http_status = 429 AND created_at >= ?
                 ORDER BY id DESC LIMIT 40',
                [gmdate('Y-m-d H:i:s', time() - self::COOLDOWN_429)]
            );
        } catch (\Throwable) {
            return 0;
        }
        $latest = 0;
        foreach ($rows as $row) {
            if ($this->rateLimitGroup((string) ($row['endpoint'] ?? '')) !== $group) {
                continue;
            }
            $ts = strtotime((string) ($row['created_at'] ?? '') . ' UTC');
            if ($ts === false) {
                continue;
            }
            $until = $ts + self::COOLDOWN_429;
            if ($until > $latest) {
                $latest = $until;
            }
        }
        return max(0, $latest - time());
    }

    private function groupMinIntervalRemaining(string $group): int
    {
        try {
            $rows = $this->db->all(
                'SELECT endpoint, created_at FROM indexnow_log
                 WHERE created_at >= ? ORDER BY id DESC LIMIT 30',
                [gmdate('Y-m-d H:i:s', time() - self::ENDPOINT_MIN_INTERVAL)]
            );
        } catch (\Throwable) {
            return 0;
        }
        foreach ($rows as $row) {
            if ($this->rateLimitGroup((string) ($row['endpoint'] ?? '')) !== $group) {
                continue;
            }
            $ts = strtotime((string) ($row['created_at'] ?? '') . ' UTC');
            if ($ts === false) {
                continue;
            }
            $left = ($ts + self::ENDPOINT_MIN_INTERVAL) - time();
            return max(0, $left);
        }
        return 0;
    }

    private function recentAutoSubmitWithin(int $seconds): bool
    {
        try {
            $row = $this->db->one(
                "SELECT created_at FROM indexnow_log
                 WHERE source LIKE 'auto:%' AND created_at >= ?
                 ORDER BY id DESC LIMIT 1",
                [gmdate('Y-m-d H:i:s', time() - max(1, $seconds))]
            );
            return is_array($row) && $row !== [];
        } catch (\Throwable) {
            return false;
        }
    }

    /**
     * @param list<string> $urls
     * @return list<string>
     */
    private function filterUrlsNotRecentlySubmitted(array $urls, int $seconds): array
    {
        if ($urls === []) {
            return [];
        }
        try {
            $rows = $this->db->all(
                'SELECT urls_json FROM indexnow_log
                 WHERE ok = 1 AND created_at >= ?
                 ORDER BY id DESC LIMIT 80',
                [gmdate('Y-m-d H:i:s', time() - max(1, $seconds))]
            );
        } catch (\Throwable) {
            return $urls;
        }
        $recent = [];
        foreach ($rows as $row) {
            $decoded = json_decode((string) ($row['urls_json'] ?? ''), true);
            if (!is_array($decoded)) {
                continue;
            }
            foreach ($decoded as $u) {
                $recent[trim((string) $u)] = true;
            }
        }
        if ($recent === []) {
            return $urls;
        }
        return array_values(array_filter($urls, static fn(string $u) => !isset($recent[$u])));
    }

    /**
     * @param list<string> $urls
     * @return list<string>
     */
    private function normalizeUrls(array $urls, string $host): array
    {
        $out = [];
        $origin = $this->siteOrigin();
        foreach ($urls as $u) {
            $u = trim((string) $u);
            if ($u === '') {
                continue;
            }
            if (!str_starts_with($u, 'http://') && !str_starts_with($u, 'https://')) {
                $u = $origin . '/' . ltrim($u, '/');
            }
            $uHost = parse_url($u, PHP_URL_HOST);
            if (!is_string($uHost) || strcasecmp($uHost, $host) !== 0) {
                // Allow www vs bare: if host matches without www
                $a = preg_replace('/^www\./i', '', (string) $uHost);
                $b = preg_replace('/^www\./i', '', $host);
                if ($a !== $b) {
                    continue;
                }
            }
            $out[] = $u;
        }
        return array_values(array_unique($out));
    }

    /**
     * @param list<string> $urls
     * @param array{ok: bool, status: int, body: string, error?: string|null} $res
     */
    private function logSubmission(string $endpoint, array $urls, array $res, string $source): void
    {
        try {
            $this->db->run(
                'INSERT INTO indexnow_log (endpoint, http_status, url_count, urls_json, response_body, ok, source, created_at)
                 VALUES (?,?,?,?,?,?,?,?)',
                [
                    $endpoint,
                    (int) ($res['status'] ?? 0),
                    count($urls),
                    json_encode(array_slice($urls, 0, 50), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
                    mb_substr((string) (($res['error'] ?? '') !== '' && ($res['error'] ?? null) !== null
                        ? $res['error']
                        : ($res['body'] ?? '')), 0, 2000),
                    !empty($res['ok']) ? 1 : 0,
                    mb_substr($source, 0, 64),
                    gmdate('Y-m-d H:i:s'),
                ]
            );
        } catch (\Throwable) {
        }
    }
}
