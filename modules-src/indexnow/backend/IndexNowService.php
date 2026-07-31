<?php
declare(strict_types=1);

namespace App\PackageModules\Indexnow;

use App\Platform\Contracts\PlatformDatabaseInterface;
use App\Platform\PlatformContext;

final class IndexNowService
{
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
            'endpoints' => [
                'https://yandex.com/indexnow',
                'https://api.indexnow.org/indexnow',
            ],
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
        if ($endpoints === []) {
            $endpoints = ['https://yandex.com/indexnow', 'https://api.indexnow.org/indexnow'];
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
     * @return array{ok: bool, results: list<array<string, mixed>>, submitted: int}
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

        $keyLocation = (string) ($settings['key_file_url'] ?? '');
        $client = new IndexNowClient();
        $results = [];
        $anyOk = false;
        foreach ((array) ($settings['endpoints'] ?? []) as $endpoint) {
            $endpoint = trim((string) $endpoint);
            if ($endpoint === '') {
                continue;
            }
            $res = $client->submit($endpoint, $host, $key, $urls, $keyLocation !== '' ? $keyLocation : null);
            $this->logSubmission($endpoint, $urls, $res, $source);
            $results[] = [
                'endpoint' => $endpoint,
                'ok' => $res['ok'],
                'status' => $res['status'],
                'body' => $res['body'],
                'error' => $res['error'] ?? null,
            ];
            if ($res['ok']) {
                $anyOk = true;
            }
        }

        return ['ok' => $anyOk, 'results' => $results, 'submitted' => count($urls)];
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
