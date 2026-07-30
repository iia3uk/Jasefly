<?php
declare(strict_types=1);

namespace App\PackageModules\AiContentOptimizer;

use App\Platform\Contracts\PlatformDatabaseInterface;

final class OptimizerService
{
    public function __construct(
        private PlatformDatabaseInterface $db,
        private ContentCatalog $catalog = new ContentCatalog(),
        private OpenRouterClient $client = new OpenRouterClient(),
    ) {}

    /** @return array<string, mixed> */
    public function getSettings(): array
    {
        $row = $this->db->one('SELECT * FROM ai_aco_settings WHERE id=1') ?? [];
        $merged = array_merge([
            'api_keys' => '',
            'models' => '',
            'proxy_host' => '',
            'proxy_port' => null,
            'proxy_user' => '',
            'proxy_pass' => '',
            'default_prompt' => '',
            'cron_enabled' => 0,
            'batch_size' => 1,
            'temperature' => 0.4,
            'max_tokens' => 6000,
            'web_search' => 0,
        ], $row);
        $host = trim((string) ($merged['proxy_host'] ?? ''));
        $port = (int) ($merged['proxy_port'] ?? 0);
        $merged['proxy'] = $host !== '' ? ($host . ($port > 0 ? ':' . $port : '')) : '';
        $user = (string) ($merged['proxy_user'] ?? '');
        $pass = (string) ($merged['proxy_pass'] ?? '');
        $merged['proxy_auth'] = ($user !== '' || $pass !== '') ? ($user . ':' . $pass) : '';
        return $merged;
    }

    /** @param array<string, mixed> $data */
    public function saveSettings(array $data): void
    {
        if (isset($data['proxy']) && is_string($data['proxy'])) {
            $p = trim($data['proxy']);
            if ($p === '') {
                $data['proxy_host'] = '';
                $data['proxy_port'] = null;
            } elseif (str_contains($p, ':')) {
                [$h, $port] = explode(':', $p, 2);
                $data['proxy_host'] = trim($h);
                $data['proxy_port'] = (int) $port;
            } else {
                $data['proxy_host'] = $p;
                $data['proxy_port'] = null;
            }
        }
        if (isset($data['proxy_auth']) && is_string($data['proxy_auth'])) {
            $a = trim($data['proxy_auth']);
            if ($a === '' || $a === '********') {
                // keep previous unless empty clear
                if ($a === '') {
                    $data['proxy_user'] = '';
                    $data['proxy_pass'] = '';
                }
            } elseif (str_contains($a, ':')) {
                [$u, $pw] = explode(':', $a, 2);
                $data['proxy_user'] = $u;
                $data['proxy_pass'] = $pw;
            } else {
                $data['proxy_user'] = $a;
            }
        }

        $keys = [
            'api_keys', 'models', 'proxy_host', 'proxy_port', 'proxy_user', 'proxy_pass',
            'default_prompt', 'cron_enabled', 'batch_size', 'temperature', 'max_tokens', 'web_search',
        ];
        $sets = [];
        $params = [];
        foreach ($keys as $k) {
            if (!array_key_exists($k, $data)) {
                continue;
            }
            $sets[] = "`{$k}`=?";
            $params[] = $data[$k];
        }
        if ($sets === []) {
            return;
        }
        $this->db->run('INSERT INTO ai_aco_settings (id) SELECT 1 WHERE NOT EXISTS (SELECT 1 FROM ai_aco_settings WHERE id=1)');
        try {
            $this->db->run('UPDATE ai_aco_settings SET ' . implode(',', $sets) . ' WHERE id=1', $params);
        } catch (\Throwable $e) {
            // Older schema without new columns — retry core keys only
            $core = ['api_keys', 'models', 'proxy_host', 'proxy_port', 'proxy_user', 'proxy_pass', 'default_prompt', 'cron_enabled', 'batch_size'];
            $sets = [];
            $params = [];
            foreach ($core as $k) {
                if (!array_key_exists($k, $data)) {
                    continue;
                }
                $sets[] = "`{$k}`=?";
                $params[] = $data[$k];
            }
            if ($sets !== []) {
                $this->db->run('UPDATE ai_aco_settings SET ' . implode(',', $sets) . ' WHERE id=1', $params);
            }
        }

        $cronOn = (int) ($data['cron_enabled'] ?? $this->getSettings()['cron_enabled'] ?? 0) === 1;
        try {
            if ($cronOn) {
                $this->db->run(
                    "INSERT INTO cron_schedules (name, expression, job_type, payload, is_active)
                     VALUES ('ai-content-optimizer.tick', '0 * * * *', 'ai-content-optimizer.tick', '{}', 1)
                     ON DUPLICATE KEY UPDATE is_active=1, job_type=VALUES(job_type)"
                );
            } else {
                $this->db->run("UPDATE cron_schedules SET is_active=0 WHERE name='ai-content-optimizer.tick'");
            }
        } catch (\Throwable) {
        }
    }

    /** @return list<array<string, mixed>> */
    public function listProfiles(): array
    {
        return $this->db->all('SELECT * FROM ai_aco_profiles ORDER BY id ASC');
    }

    /** @param array<string, mixed> $data */
    public function saveProfile(?int $id, array $data): int
    {
        $modes = $data['field_modes_json'] ?? $data['field_modes'] ?? null;
        if (is_array($modes)) {
            $modes = json_encode($modes, JSON_UNESCAPED_UNICODE);
        }
        // Derive boolean fields_json from modes for backwards compatibility
        $fieldsJson = $data['fields_json'] ?? null;
        if ($fieldsJson === null && is_string($modes)) {
            $decoded = json_decode($modes, true) ?: [];
            $bools = [];
            foreach ($decoded as $k => $mode) {
                $bools[$k] = $mode !== 'keep';
            }
            $fieldsJson = json_encode($bools, JSON_UNESCAPED_UNICODE);
        } elseif (is_array($fieldsJson)) {
            $fieldsJson = json_encode($fieldsJson, JSON_UNESCAPED_UNICODE);
        }

        $titleMode = (string) ($data['title_mode'] ?? 'keep');
        if (is_string($modes)) {
            $m = json_decode($modes, true) ?: [];
            if (isset($m['title'])) {
                $titleMode = (string) $m['title'];
            }
        }

        $row = [
            'name' => (string) ($data['name'] ?? 'Профиль'),
            'content_type' => (string) ($data['content_type'] ?? 'blog'),
            'body_field' => $data['body_field'] ?? null,
            'excerpt_field' => $data['excerpt_field'] ?? null,
            'is_active' => (int) ((bool) ($data['is_active'] ?? true)),
            'prompt' => $data['prompt'] ?? null,
            'fields_json' => $fieldsJson,
            'field_modes_json' => $modes,
            'title_mode' => $titleMode,
            'protect_slug' => (int) ((bool) ($data['protect_slug'] ?? true)),
            'min_chars' => (int) ($data['min_chars'] ?? $data['min_result_chars'] ?? 400),
            'min_source_chars' => (int) ($data['min_source_chars'] ?? 300),
            'min_result_chars' => (int) ($data['min_result_chars'] ?? 800),
            'min_growth_pct' => (int) ($data['min_growth_pct'] ?? 0),
            'require_preserve' => (int) ((bool) ($data['require_preserve'] ?? true)),
            'append_updated_note' => (int) ((bool) ($data['append_updated_note'] ?? true)),
            'batch_limit' => max(1, (int) ($data['batch_limit'] ?? 1)),
            'scan_limit' => max(1, (int) ($data['scan_limit'] ?? 50)),
            'interval_hours' => max(1, (int) ($data['interval_hours'] ?? 24)),
            'reupdate_days' => max(1, (int) ($data['reupdate_days'] ?? 180)),
            'published_only' => (int) ((bool) ($data['published_only'] ?? true)),
            'scheduler_enabled' => (int) ((bool) ($data['scheduler_enabled'] ?? true)),
        ];

        try {
            if ($id) {
                $this->db->run(
                    'UPDATE ai_aco_profiles SET name=?, content_type=?, body_field=?, excerpt_field=?, is_active=?, prompt=?,
                     fields_json=?, field_modes_json=?, title_mode=?, protect_slug=?, min_chars=?, min_source_chars=?,
                     min_result_chars=?, min_growth_pct=?, require_preserve=?, append_updated_note=?, batch_limit=?,
                     scan_limit=?, interval_hours=?, reupdate_days=?, published_only=?, scheduler_enabled=? WHERE id=?',
                    [...array_values($row), $id]
                );
                return $id;
            }
            $this->db->run(
                'INSERT INTO ai_aco_profiles (name, content_type, body_field, excerpt_field, is_active, prompt, fields_json,
                 field_modes_json, title_mode, protect_slug, min_chars, min_source_chars, min_result_chars, min_growth_pct,
                 require_preserve, append_updated_note, batch_limit, scan_limit, interval_hours, reupdate_days,
                 published_only, scheduler_enabled)
                 VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
                array_values($row)
            );
            return $this->db->lastInsertId();
        } catch (\Throwable) {
            // Fallback without new columns
            $legacy = [
                $row['name'], $row['content_type'], $row['is_active'], $row['prompt'], $row['fields_json'],
                $row['title_mode'], $row['protect_slug'], $row['min_chars'], $row['min_growth_pct'],
                $row['require_preserve'], $row['append_updated_note'], $row['batch_limit'], $row['interval_hours'],
            ];
            if ($id) {
                $this->db->run(
                    'UPDATE ai_aco_profiles SET name=?, content_type=?, is_active=?, prompt=?, fields_json=?, title_mode=?,
                     protect_slug=?, min_chars=?, min_growth_pct=?, require_preserve=?, append_updated_note=?,
                     batch_limit=?, interval_hours=? WHERE id=?',
                    [...$legacy, $id]
                );
                return $id;
            }
            $this->db->run(
                'INSERT INTO ai_aco_profiles (name, content_type, is_active, prompt, fields_json, title_mode, protect_slug,
                 min_chars, min_growth_pct, require_preserve, append_updated_note, batch_limit, interval_hours)
                 VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)',
                $legacy
            );
            return $this->db->lastInsertId();
        }
    }

    public function deleteProfile(int $id): void
    {
        $this->db->run('DELETE FROM ai_aco_profiles WHERE id=?', [$id]);
        $this->db->run('DELETE FROM ai_aco_cursors WHERE profile_id=?', [$id]);
    }

    /**
     * @return array{processed: int, ok: int, skipped: int, errors: int, details: list<array<string, mixed>>}
     */
    public function run(?int $profileId = null, ?int $limit = null): array
    {
        $settings = $this->getSettings();
        if ($profileId) {
            $profiles = $this->db->all('SELECT * FROM ai_aco_profiles WHERE id=?', [$profileId]);
        } else {
            $profiles = $this->db->all(
                'SELECT * FROM ai_aco_profiles WHERE is_active=1
                 AND (scheduler_enabled IS NULL OR scheduler_enabled=1)
                 AND (last_run_at IS NULL OR last_run_at <= DATE_SUB(NOW(), INTERVAL interval_hours HOUR))
                 ORDER BY id ASC'
            );
        }

        $out = ['processed' => 0, 'ok' => 0, 'skipped' => 0, 'errors' => 0, 'details' => []];
        foreach ($profiles as $profile) {
            $left = $limit ?? max(1, (int) ($profile['batch_limit'] ?? $settings['batch_size'] ?? 1));
            $scanned = 0;
            $scanMax = max(1, (int) ($profile['scan_limit'] ?? 50));
            while ($left > 0 && $scanned < $scanMax) {
                $detail = $this->processNext($profile, $settings);
                $scanned++;
                if ($detail['status'] === 'empty') {
                    break;
                }
                if (($detail['status'] ?? '') === 'scan_skip') {
                    continue;
                }
                $out['processed']++;
                $out['details'][] = $detail;
                if ($detail['status'] === 'ok') {
                    $out['ok']++;
                    $left--;
                } elseif ($detail['status'] === 'skipped') {
                    $out['skipped']++;
                    $left--;
                } else {
                    $out['errors']++;
                    $left--;
                }
            }
            $this->db->run('UPDATE ai_aco_profiles SET last_run_at=NOW() WHERE id=?', [(int) $profile['id']]);
        }
        return $out;
    }

    /**
     * @param array<string, mixed> $profile
     * @param array<string, mixed> $settings
     * @return array<string, mixed>
     */
    private function processNext(array $profile, array $settings): array
    {
        $profileId = (int) $profile['id'];
        $type = (string) $profile['content_type'];
        $cursor = $this->db->one('SELECT last_content_id FROM ai_aco_cursors WHERE profile_id=?', [$profileId]);
        $after = (int) ($cursor['last_content_id'] ?? 0);
        $row = $this->catalog->nextItem($this->db, $type, $after);
        if (!$row) {
            $this->db->run(
                'INSERT INTO ai_aco_cursors (profile_id, last_content_id) VALUES (?,0)
                 ON DUPLICATE KEY UPDATE last_content_id=0',
                [$profileId]
            );
            $row = $this->catalog->nextItem($this->db, $type, 0);
        }
        if (!$row) {
            return ['status' => 'empty', 'message' => 'Нет опубликованных материалов'];
        }

        $id = (int) $row['id'];
        $this->db->run(
            'INSERT INTO ai_aco_cursors (profile_id, last_content_id) VALUES (?,?)
             ON DUPLICATE KEY UPDATE last_content_id=VALUES(last_content_id)',
            [$profileId, $id]
        );

        $before = $this->catalog->extract($type, $row);
        $sourceLen = mb_strlen(trim(strip_tags($before['content'])));
        $minSource = (int) ($profile['min_source_chars'] ?? 0);
        if ($minSource > 0 && $sourceLen < $minSource) {
            return ['status' => 'scan_skip', 'message' => "Исходник короче {$minSource} символов", 'content_id' => $id];
        }

        $modes = $this->decodeModes($profile);
        $promptTpl = trim((string) ($profile['prompt'] ?? '')) ?: (string) ($settings['default_prompt'] ?? '');
        $prompt = $this->renderPrompt($promptTpl, $before, $id, $sourceLen);

        $userMsg = "Тип: {$type}\nID: {$id}\nSlug: {$before['slug']}\n\n"
            . "title:\n{$before['title']}\n\nexcerpt:\n{$before['excerpt']}\n\n"
            . "content HTML:\n{$before['content']}\n\n"
            . "seo_title: {$before['seo_title']}\nseo_description: {$before['seo_description']}\nseo_keywords: {$before['seo_keywords']}\n";

        $keys = preg_split('/\R+/', (string) ($settings['api_keys'] ?? '')) ?: [];
        $models = preg_split('/\R+/', (string) ($settings['models'] ?? '')) ?: [];
        $proxy = [
            'host' => (string) ($settings['proxy_host'] ?? ''),
            'port' => (int) ($settings['proxy_port'] ?? 0),
            'user' => (string) ($settings['proxy_user'] ?? ''),
            'pass' => (string) ($settings['proxy_pass'] ?? ''),
        ];
        $opts = [
            'temperature' => (float) ($settings['temperature'] ?? 0.4),
            'max_tokens' => (int) ($settings['max_tokens'] ?? 6000),
            'web_search' => (bool) ($settings['web_search'] ?? false),
        ];

        $ai = $this->client->chat($keys, $models, $prompt, $userMsg, $proxy, $opts);
        if (!$ai['ok']) {
            return $this->logResult($profileId, $type, $id, $before['title'], 'error', null, null, (string) ($ai['error'] ?? 'AI error'));
        }

        $proposed = $this->parseJsonContent((string) $ai['content']);
        if ($proposed === null) {
            return $this->logResult($profileId, $type, $id, $before['title'], 'error', $ai['model'] ?? null, null, 'Не удалось разобрать JSON ответа');
        }

        [$appliedLogical, $fieldResults] = $this->applyModes($before, $proposed, $modes);
        $quality = $this->qualityGate($before, $appliedLogical, $profile);
        if (!$quality['ok']) {
            $result = ['fields' => $fieldResults, 'proposed' => $proposed, 'reason' => $quality['reason']];
            return $this->logResult($profileId, $type, $id, $before['title'], 'skipped', $ai['model'] ?? null, null, $quality['reason'], '', $result);
        }

        if (!empty($profile['append_updated_note'])) {
            $note = '<p><em>Информация обновлена — ' . date('d.m.Y') . '</em></p>';
            if (!str_contains($appliedLogical['content'], 'Информация обновлена —')) {
                $appliedLogical['content'] = rtrim($appliedLogical['content']) . "\n" . $note;
            }
        }

        $allowed = [];
        foreach ($fieldResults as $k => $fr) {
            $allowed[$k] = ($fr['status'] ?? '') === 'applied';
        }
        // content always if applied
        $columns = $this->catalog->toColumns($type, $allowed, $appliedLogical);

        $beforeJson = json_encode($before, JSON_UNESCAPED_UNICODE);
        $this->db->run(
            'INSERT INTO ai_aco_backups (profile_id, content_type, content_id, content_title, before_json, model_used)
             VALUES (?,?,?,?,?,?)',
            [$profileId, $type, $id, $before['title'], $beforeJson, $ai['model'] ?? null]
        );
        $backupId = $this->db->lastInsertId();

        try {
            $this->db->transaction(function () use ($type, $id, $columns, $backupId, $appliedLogical, $proposed, $fieldResults) {
                if ($columns !== []) {
                    $this->catalog->updateItem($this->db, $type, $id, $columns);
                }
                $afterPayload = json_encode([
                    'proposed' => $proposed,
                    'applied' => $appliedLogical,
                    'fields' => $fieldResults,
                ], JSON_UNESCAPED_UNICODE);
                try {
                    $this->db->run(
                        'UPDATE ai_aco_backups SET after_json=?, applied_json=? WHERE id=?',
                        [json_encode($appliedLogical, JSON_UNESCAPED_UNICODE), $afterPayload, $backupId]
                    );
                } catch (\Throwable) {
                    $this->db->run(
                        'UPDATE ai_aco_backups SET after_json=? WHERE id=?',
                        [json_encode($appliedLogical, JSON_UNESCAPED_UNICODE), $backupId]
                    );
                }
            });
        } catch (\Throwable $e) {
            return $this->logResult($profileId, $type, $id, $before['title'], 'error', $ai['model'] ?? null, $backupId, $e->getMessage());
        }

        $url = $this->catalog->publicUrl($type, $row);
        $result = ['fields' => $fieldResults, 'proposed' => $proposed, 'applied' => $appliedLogical];
        return $this->logResult(
            $profileId, $type, $id, $appliedLogical['title'] ?: $before['title'],
            'ok', $ai['model'] ?? null, $backupId, 'Статья обновлена', $url, $result
        );
    }

    /**
     * @return array{keep: string, always: string, if_better: string}
     * @return array<string, string>
     */
    private function decodeModes(array $profile): array
    {
        $raw = $profile['field_modes_json'] ?? null;
        if (is_string($raw)) {
            $raw = json_decode($raw, true);
        }
        $defaults = [
            'title' => (string) ($profile['title_mode'] ?? 'keep'),
            'seo_title' => 'always',
            'seo_description' => 'always',
            'seo_keywords' => 'always',
            'excerpt' => 'always',
            'content' => 'always',
        ];
        if (!is_array($raw)) {
            $fields = $profile['fields_json'] ?? null;
            if (is_string($fields)) {
                $fields = json_decode($fields, true);
            }
            if (is_array($fields)) {
                foreach ($fields as $k => $on) {
                    $defaults[$k] = $on ? ($defaults[$k] ?? 'always') : 'keep';
                }
            }
            return $defaults;
        }
        foreach ($raw as $k => $mode) {
            $mode = (string) $mode;
            $defaults[(string) $k] = in_array($mode, ['keep', 'always', 'if_better'], true) ? $mode : 'keep';
        }
        return $defaults;
    }

    /**
     * @param array<string, string> $before
     * @param array<string, string> $proposed
     * @param array<string, string> $modes
     * @return array{0: array<string, string>, 1: list<array<string, mixed>>}
     */
    private function applyModes(array $before, array $proposed, array $modes): array
    {
        $applied = $before;
        $results = [];
        $labels = [
            'title' => 'Заголовок записи',
            'seo_title' => 'SEO Title',
            'seo_description' => 'SEO Description',
            'seo_keywords' => 'SEO Keywords',
            'excerpt' => 'Анонс',
            'content' => 'Текст',
        ];
        foreach ($labels as $key => $label) {
            $mode = $modes[$key] ?? 'keep';
            $old = $before[$key] ?? '';
            $neu = $proposed[$key] ?? '';
            $status = 'keep';
            $note = '';
            if ($mode === 'keep') {
                $status = 'not_applied';
                $note = 'Изменение отключено в профиле';
            } elseif ($neu === '' || trim($neu) === '') {
                $status = 'not_applied';
                $note = 'AI не предложил значение';
            } elseif ($mode === 'always') {
                $applied[$key] = $neu;
                $status = 'applied';
            } elseif ($mode === 'if_better') {
                if ($this->titleBetter($old, $neu) || ($key !== 'title' && mb_strlen(strip_tags($neu)) > mb_strlen(strip_tags($old)))) {
                    $applied[$key] = $neu;
                    $status = 'applied';
                } else {
                    $status = 'not_applied';
                    $note = 'Новый вариант не лучше исходного';
                }
            }
            $results[] = [
                'key' => $key,
                'label' => $label,
                'old' => $old,
                'proposed' => $neu,
                'applied_value' => $applied[$key] ?? $old,
                'status' => $status,
                'note' => $note,
            ];
        }
        return [$applied, $results];
    }

    private function renderPrompt(string $tpl, array $before, int $id, int $sourceLen): string
    {
        $site = 'Jasefly';
        try {
            $row = $this->db->one('SELECT site_name FROM site_settings WHERE id=1');
            if ($row && !empty($row['site_name'])) {
                $site = (string) $row['site_name'];
            }
        } catch (\Throwable) {
        }
        $map = [
            '{article_id}' => (string) $id,
            '{article_title}' => $before['title'],
            '{article_text}' => $before['content'],
            '{site_name}' => $site,
            '{current_date}' => date('d.m.Y'),
            '{source_length}' => (string) $sourceLen,
        ];
        $out = str_replace(array_keys($map), array_values($map), $tpl);
        if (!str_contains($out, 'JSON')) {
            $out .= "\n\nВерни ТОЛЬКО JSON с ключами: title, excerpt, content, seo_title, seo_description, seo_keywords. content — HTML.";
        }
        return $out;
    }

    private function titleBetter(string $old, string $new): bool
    {
        $old = trim($old);
        $new = trim($new);
        if ($new === '' || mb_strlen($new) < 8) {
            return false;
        }
        if ($old === '') {
            return true;
        }
        return $new !== $old && mb_strlen($new) >= mb_strlen($old);
    }

    /** @return array<string, string>|null */
    private function parseJsonContent(string $text): ?array
    {
        $text = trim($text);
        if (preg_match('/```(?:json)?\s*(\{.*?\})\s*```/s', $text, $m)) {
            $text = $m[1];
        }
        $start = strpos($text, '{');
        $end = strrpos($text, '}');
        if ($start === false || $end === false || $end <= $start) {
            return null;
        }
        $json = json_decode(substr($text, $start, $end - $start + 1), true);
        if (!is_array($json)) {
            return null;
        }
        $out = [];
        foreach (['title', 'excerpt', 'content', 'seo_title', 'seo_description', 'seo_keywords'] as $k) {
            if (isset($json[$k]) && is_scalar($json[$k])) {
                $out[$k] = (string) $json[$k];
            }
        }
        return $out === [] ? null : $out;
    }

    /**
     * @param array<string, string> $before
     * @param array<string, string> $after
     * @param array<string, mixed> $profile
     * @return array{ok: bool, reason?: string}
     */
    private function qualityGate(array $before, array $after, array $profile): array
    {
        $plain = trim(strip_tags($after['content'] ?? ''));
        $oldPlain = trim(strip_tags($before['content'] ?? ''));
        $minResult = (int) ($profile['min_result_chars'] ?? $profile['min_chars'] ?? 0);
        if ($minResult > 0 && mb_strlen($plain) < $minResult) {
            return ['ok' => false, 'reason' => "Результат короче min ({$minResult})"];
        }
        if ($oldPlain !== '' && mb_strlen($plain) < mb_strlen($oldPlain)) {
            return ['ok' => false, 'reason' => 'Результат короче исходного текста'];
        }
        $growth = (int) ($profile['min_growth_pct'] ?? 0);
        if ($growth > 0 && $oldPlain !== '') {
            $need = (int) ceil(mb_strlen($oldPlain) * (1 + $growth / 100));
            if (mb_strlen($plain) < $need) {
                return ['ok' => false, 'reason' => "Объём не вырос на {$growth}%"];
            }
        }
        if (!empty($profile['require_preserve'])) {
            $tokens = preg_split('/\s+/u', mb_strtolower(strip_tags($before['title'] . ' ' . mb_substr($before['content'], 0, 800)))) ?: [];
            $keepers = [];
            foreach ($tokens as $t) {
                $t = preg_replace('/[^\p{L}\p{N}-]+/u', '', $t) ?? '';
                if (mb_strlen($t) >= 6) {
                    $keepers[$t] = true;
                }
                if (count($keepers) >= 8) {
                    break;
                }
            }
            $hay = mb_strtolower(strip_tags($after['content'] . ' ' . $after['title']));
            $hit = 0;
            foreach (array_keys($keepers) as $k) {
                if (str_contains($hay, $k)) {
                    $hit++;
                }
            }
            if ($keepers !== [] && $hit < max(1, (int) floor(count($keepers) * 0.35))) {
                return ['ok' => false, 'reason' => 'Исходная тема/факты похоже не сохранились'];
            }
        }
        if ($plain === '') {
            return ['ok' => false, 'reason' => 'Пустой content'];
        }
        return ['ok' => true];
    }

    /** @param array<string, mixed>|null $result */
    private function logResult(
        int $profileId,
        string $type,
        int $contentId,
        string $title,
        string $status,
        ?string $model,
        ?int $backupId,
        string $message,
        string $url = '',
        ?array $result = null,
    ): array {
        $resultJson = $result !== null ? json_encode($result, JSON_UNESCAPED_UNICODE) : null;
        try {
            $this->db->run(
                'INSERT INTO ai_aco_log (profile_id, content_type, content_id, content_title, status, model_used, message, result_json, backup_id, public_url)
                 VALUES (?,?,?,?,?,?,?,?,?,?)',
                [$profileId, $type, $contentId, $title, $status, $model, $message, $resultJson, $backupId, $url !== '' ? $url : null]
            );
        } catch (\Throwable) {
            $this->db->run(
                'INSERT INTO ai_aco_log (profile_id, content_type, content_id, content_title, status, model_used, message, backup_id, public_url)
                 VALUES (?,?,?,?,?,?,?,?,?)',
                [$profileId, $type, $contentId, $title, $status, $model, $message, $backupId, $url !== '' ? $url : null]
            );
        }
        return [
            'status' => $status,
            'content_type' => $type,
            'content_id' => $contentId,
            'title' => $title,
            'model' => $model,
            'message' => $message,
            'backup_id' => $backupId,
            'url' => $url,
            'result' => $result,
        ];
    }

    /** @return list<array<string, mixed>> */
    public function listLog(int $limit = 50): array
    {
        return $this->db->all('SELECT * FROM ai_aco_log ORDER BY id DESC LIMIT ' . max(1, min(200, $limit)));
    }

    /** @return array<string, mixed>|null */
    public function getLogDetail(int $id): ?array
    {
        $log = $this->db->one('SELECT * FROM ai_aco_log WHERE id=?', [$id]);
        if (!$log) {
            return null;
        }
        $backup = null;
        if (!empty($log['backup_id'])) {
            $backup = $this->db->one('SELECT * FROM ai_aco_backups WHERE id=?', [(int) $log['backup_id']]);
        }
        $result = null;
        if (!empty($log['result_json'])) {
            $result = json_decode((string) $log['result_json'], true);
        } elseif ($backup && !empty($backup['applied_json'])) {
            $result = json_decode((string) $backup['applied_json'], true);
        } elseif ($backup) {
            $before = json_decode((string) ($backup['before_json'] ?? '{}'), true) ?: [];
            $after = json_decode((string) ($backup['after_json'] ?? '{}'), true) ?: [];
            $result = ['proposed' => $after, 'applied' => $after, 'before' => $before];
        }
        return ['log' => $log, 'backup' => $backup, 'result' => $result];
    }

    /** @return array<string, mixed>|null */
    public function getBackup(int $id): ?array
    {
        return $this->db->one('SELECT * FROM ai_aco_backups WHERE id=?', [$id]);
    }
}
