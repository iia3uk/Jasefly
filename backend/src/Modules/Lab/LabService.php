<?php
declare(strict_types=1);

namespace App\Modules\Lab;

use App\Database;

final class LabService
{
    public const STATUSES = ['draft', 'active', 'disabled', 'archived'];
    public const RENDER_MODES = ['embedded', 'iframe'];

    public function __construct(private Database $db) {}

    /** @return list<array<string, mixed>> */
    public function list(bool $includeDeleted = false): array
    {
        $sql = 'SELECT * FROM lab_experiments';
        if (!$includeDeleted) {
            $sql .= ' WHERE deleted_at IS NULL';
        }
        $sql .= ' ORDER BY updated_at DESC, id DESC';
        return array_map([$this, 'normalize'], $this->db->all($sql));
    }

    public function find(int $id, bool $withDeleted = false): ?array
    {
        $sql = 'SELECT * FROM lab_experiments WHERE id = ?';
        if (!$withDeleted) {
            $sql .= ' AND deleted_at IS NULL';
        }
        $row = $this->db->one($sql, [$id]);
        return $row ? $this->normalize($row) : null;
    }

    public function findBySlug(string $slug, bool $withDeleted = false): ?array
    {
        $sql = 'SELECT * FROM lab_experiments WHERE slug = ?';
        if (!$withDeleted) {
            $sql .= ' AND deleted_at IS NULL';
        }
        $row = $this->db->one($sql, [$slug]);
        return $row ? $this->normalize($row) : null;
    }

    /**
     * @param array<string, mixed> $input
     * @return array{ok: bool, data?: array, error?: string, code?: string, status?: int}
     */
    public function create(array $input): array
    {
        $parsed = $this->parseWrite($input, true);
        if (!$parsed['ok']) {
            return $parsed;
        }
        $d = $parsed['data'];
        if ($this->slugTaken($d['slug'])) {
            return ['ok' => false, 'error' => 'Slug already exists', 'code' => 'slug_taken', 'status' => 422];
        }
        $this->db->run(
            'INSERT INTO lab_experiments
              (name, slug, entry_key, status, is_public, noindex, render_mode, settings_json, content_json)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [
                $d['name'],
                $d['slug'],
                $d['entry_key'],
                $d['status'],
                $d['is_public'],
                $d['noindex'],
                $d['render_mode'],
                $d['settings_json'],
                $d['content_json'],
            ]
        );
        $row = $this->find((int) $this->db->id());
        return ['ok' => true, 'data' => $row];
    }

    /**
     * @param array<string, mixed> $input
     * @return array{ok: bool, data?: array, error?: string, code?: string, status?: int}
     */
    public function update(int $id, array $input): array
    {
        $existing = $this->find($id);
        if (!$existing) {
            return ['ok' => false, 'error' => 'Not found', 'status' => 404];
        }
        $parsed = $this->parseWrite($input, false, $existing);
        if (!$parsed['ok']) {
            return $parsed;
        }
        $d = $parsed['data'];
        if ($this->slugTaken($d['slug'], $id)) {
            return ['ok' => false, 'error' => 'Slug already exists', 'code' => 'slug_taken', 'status' => 422];
        }
        $this->db->run(
            'UPDATE lab_experiments SET
              name = ?, slug = ?, entry_key = ?, status = ?, is_public = ?, noindex = ?,
              render_mode = ?, settings_json = ?, content_json = ?
             WHERE id = ? AND deleted_at IS NULL',
            [
                $d['name'],
                $d['slug'],
                $d['entry_key'],
                $d['status'],
                $d['is_public'],
                $d['noindex'],
                $d['render_mode'],
                $d['settings_json'],
                $d['content_json'],
                $id,
            ]
        );
        return ['ok' => true, 'data' => $this->find($id)];
    }

    /** @return array{ok: bool, error?: string, status?: int} */
    public function softDelete(int $id): array
    {
        $row = $this->find($id);
        if (!$row) {
            return ['ok' => false, 'error' => 'Not found', 'status' => 404];
        }
        $this->db->run(
            'UPDATE lab_experiments SET deleted_at = NOW(), slug = CONCAT(slug, ?, ?) WHERE id = ? AND deleted_at IS NULL',
            ['__deleted_', (string) $id, $id]
        );
        return ['ok' => true];
    }

    /** @return array{ok: bool, data?: array, error?: string, status?: int, code?: string} */
    public function restore(int $id): array
    {
        $row = $this->find($id, true);
        if (!$row) {
            return ['ok' => false, 'error' => 'Not found', 'status' => 404];
        }
        if (empty($row['deleted_at'])) {
            return ['ok' => true, 'data' => $row];
        }
        $slug = (string) $row['slug'];
        if (preg_match('/^(.*)__deleted_\d+$/', $slug, $m)) {
            $slug = $m[1];
        }
        if ($this->slugTaken($slug, $id)) {
            return ['ok' => false, 'error' => 'Slug conflict on restore', 'code' => 'slug_taken', 'status' => 422];
        }
        $this->db->run(
            'UPDATE lab_experiments SET deleted_at = NULL, slug = ? WHERE id = ?',
            [$slug, $id]
        );
        return ['ok' => true, 'data' => $this->find($id)];
    }

    /** @return array{ok: bool, data?: array, error?: string, status?: int} */
    public function setStatus(int $id, string $status): array
    {
        if (!in_array($status, self::STATUSES, true)) {
            return ['ok' => false, 'error' => 'Invalid status', 'status' => 422];
        }
        $row = $this->find($id);
        if (!$row) {
            return ['ok' => false, 'error' => 'Not found', 'status' => 404];
        }
        $this->db->run(
            'UPDATE lab_experiments SET status = ? WHERE id = ? AND deleted_at IS NULL',
            [$status, $id]
        );
        return ['ok' => true, 'data' => $this->find($id)];
    }

    /** @return array{ok: bool, data?: array, error?: string, status?: int} */
    public function duplicate(int $id): array
    {
        $src = $this->find($id);
        if (!$src) {
            return ['ok' => false, 'error' => 'Not found', 'status' => 404];
        }
        $baseSlug = preg_replace('/-copy(-\d+)?$/', '', (string) $src['slug']) ?: 'experiment';
        $slug = $baseSlug . '-copy';
        $n = 2;
        while ($this->slugTaken($slug)) {
            $slug = $baseSlug . '-copy-' . $n;
            $n++;
        }
        return $this->create([
            'name' => (string) $src['name'] . ' (копия)',
            'slug' => $slug,
            'entry_key' => $src['entry_key'],
            'status' => 'draft',
            'is_public' => false,
            'noindex' => true,
            'render_mode' => $src['render_mode'],
            'settings_json' => $src['settings_json'],
            'content_json' => $src['content_json'],
        ]);
    }

    /** @return array{ok: bool, data?: array, error?: string, status?: int} */
    public function resetContent(int $id): array
    {
        $row = $this->find($id);
        if (!$row) {
            return ['ok' => false, 'error' => 'Not found', 'status' => 404];
        }
        $defaults = $this->defaultContentForEntry((string) $row['entry_key']);
        $this->db->run(
            'UPDATE lab_experiments SET content_json = ?, settings_json = ? WHERE id = ? AND deleted_at IS NULL',
            [
                json_encode($defaults['content'], JSON_UNESCAPED_UNICODE),
                json_encode($defaults['settings'], JSON_UNESCAPED_UNICODE),
                $id,
            ]
        );
        return ['ok' => true, 'data' => $this->find($id)];
    }

    /**
     * Public / draft-preview resolve.
     * @return array{ok: bool, data?: array, error?: string, code?: string, status?: int, preview?: bool}
     */
    public function resolvePublic(string $slug, bool $staffCanPreview): array
    {
        $row = $this->findBySlug($slug);
        if (!$row) {
            return ['ok' => false, 'error' => 'Not found', 'status' => 404];
        }
        $status = (string) $row['status'];
        if ($status === 'disabled' || $status === 'archived') {
            return ['ok' => false, 'error' => 'Not found', 'status' => 404];
        }
        $preview = false;
        if ($status === 'draft') {
            if (!$staffCanPreview) {
                return ['ok' => false, 'error' => 'Not found', 'status' => 404];
            }
            $preview = true;
        } elseif ($status === 'active') {
            if (!(int) $row['is_public'] && !$staffCanPreview) {
                return ['ok' => false, 'error' => 'Not found', 'status' => 404];
            }
            if (!(int) $row['is_public'] && $staffCanPreview) {
                $preview = true;
            }
        } else {
            return ['ok' => false, 'error' => 'Not found', 'status' => 404];
        }

        if (!LabEntryRegistry::isKnown((string) $row['entry_key'])) {
            return [
                'ok' => false,
                'error' => 'Unknown experiment entry',
                'code' => 'unknown_entry',
                'status' => 422,
            ];
        }

        $data = $row;
        $data['preview'] = $preview;
        return ['ok' => true, 'data' => $data, 'preview' => $preview];
    }

    public function validateSlug(string $slug): bool
    {
        return (bool) preg_match('/^[a-z0-9]+(?:-[a-z0-9]+)*$/', $slug)
            && strlen($slug) >= 2
            && strlen($slug) <= 191;
    }

    private function slugTaken(string $slug, ?int $exceptId = null): bool
    {
        $sql = 'SELECT id FROM lab_experiments WHERE slug = ? AND deleted_at IS NULL';
        $params = [$slug];
        if ($exceptId !== null) {
            $sql .= ' AND id <> ?';
            $params[] = $exceptId;
        }
        return (bool) $this->db->one($sql, $params);
    }

    /**
     * @param array<string, mixed> $input
     * @param array<string, mixed>|null $existing
     * @return array{ok: bool, data?: array, error?: string, code?: string, status?: int}
     */
    private function parseWrite(array $input, bool $creating, ?array $existing = null): array
    {
        $name = trim((string) ($input['name'] ?? $existing['name'] ?? ''));
        if ($name === '') {
            return ['ok' => false, 'error' => 'name is required', 'status' => 422];
        }

        $slugRaw = $input['slug'] ?? $existing['slug'] ?? null;
        $slug = is_string($slugRaw) ? $this->slugify($slugRaw) : '';
        if ($slug === '' && $creating) {
            $slug = $this->slugify($name);
        }
        if (!$this->validateSlug($slug)) {
            return ['ok' => false, 'error' => 'Invalid slug (use lowercase letters, digits, hyphens)', 'code' => 'invalid_slug', 'status' => 422];
        }

        $entryKey = trim((string) ($input['entry_key'] ?? $existing['entry_key'] ?? 'starter'));
        try {
            LabEntryRegistry::assertKnown($entryKey);
        } catch (\InvalidArgumentException $e) {
            return ['ok' => false, 'error' => $e->getMessage(), 'code' => 'unknown_entry', 'status' => 422];
        }

        $status = (string) ($input['status'] ?? $existing['status'] ?? 'draft');
        if (!in_array($status, self::STATUSES, true)) {
            return ['ok' => false, 'error' => 'Invalid status', 'status' => 422];
        }

        $renderMode = (string) ($input['render_mode'] ?? $existing['render_mode'] ?? 'embedded');
        if (!in_array($renderMode, self::RENDER_MODES, true)) {
            return ['ok' => false, 'error' => 'Invalid render_mode', 'status' => 422];
        }

        $isPublic = $this->toBool($input['is_public'] ?? $existing['is_public'] ?? false);
        $noindex = $this->toBool($input['noindex'] ?? $existing['noindex'] ?? true);

        $settings = $this->encodeJsonField($input['settings_json'] ?? $existing['settings_json'] ?? new \stdClass(), 'settings_json');
        if (!$settings['ok']) {
            return $settings;
        }
        $content = $this->encodeJsonField($input['content_json'] ?? $existing['content_json'] ?? new \stdClass(), 'content_json');
        if (!$content['ok']) {
            return $content;
        }

        if ($creating && !isset($input['content_json']) && !isset($existing['content_json'])) {
            $defaults = $this->defaultContentForEntry($entryKey);
            $content['json'] = json_encode($defaults['content'], JSON_UNESCAPED_UNICODE);
            $settings['json'] = json_encode($defaults['settings'], JSON_UNESCAPED_UNICODE);
        }

        return [
            'ok' => true,
            'data' => [
                'name' => mb_substr($name, 0, 191),
                'slug' => $slug,
                'entry_key' => $entryKey,
                'status' => $status,
                'is_public' => $isPublic ? 1 : 0,
                'noindex' => $noindex ? 1 : 0,
                'render_mode' => $renderMode,
                'settings_json' => $settings['json'],
                'content_json' => $content['json'],
            ],
        ];
    }

    /**
     * @return array{ok: bool, json?: string, error?: string, status?: int}
     */
    private function encodeJsonField(mixed $value, string $field): array
    {
        if (is_string($value)) {
            $trim = trim($value);
            if ($trim === '') {
                $value = new \stdClass();
            } else {
                $decoded = json_decode($trim, true);
                if (json_last_error() !== JSON_ERROR_NONE) {
                    return ['ok' => false, 'error' => "Invalid JSON in {$field}", 'status' => 422];
                }
                $value = $decoded;
            }
        }
        if (!is_array($value) && !is_object($value)) {
            return ['ok' => false, 'error' => "{$field} must be a JSON object or array", 'status' => 422];
        }
        // Reject executable-looking payloads
        if (is_array($value)) {
            foreach (['php', 'script', 'code', 'path', 'module_path', 'file'] as $bad) {
                if (array_key_exists($bad, $value)) {
                    return ['ok' => false, 'error' => "Field {$bad} is not allowed in {$field}", 'status' => 422];
                }
            }
        }
        $json = json_encode($value, JSON_UNESCAPED_UNICODE);
        if ($json === false) {
            return ['ok' => false, 'error' => "Failed to encode {$field}", 'status' => 422];
        }
        return ['ok' => true, 'json' => $json];
    }

    /** @return array{content: array, settings: array} */
    private function defaultContentForEntry(string $entryKey): array
    {
        if ($entryKey === 'starter') {
            return [
                'settings' => [
                    'theme' => 'light',
                    'accent' => '#2563eb',
                ],
                'content' => [
                    'title' => 'Jasefly Lab Starter',
                    'subtitle' => 'Изолированный эксперимент без влияния на тему сайта.',
                    'cta_label' => 'Попробовать',
                    'cta_href' => '#',
                    'cards' => [
                        ['title' => 'Изоляция CSS', 'text' => 'Только CSS Modules и корневой класс эксперимента.'],
                        ['title' => 'Whitelist entry', 'text' => 'Код грузится только из experimentRegistry.'],
                        ['title' => 'Контент из JSON', 'text' => 'Текст и карточки приходят из content_json.'],
                    ],
                ],
            ];
        }
        if ($entryKey === 'reference') {
            return [
                'settings' => [
                    'theme' => 'dark',
                    'accent' => '#5bdf6f',
                ],
                'content' => [
                    'brand' => "Cheater's Market",
                    'kicker' => 'Marketplace live · Active',
                    'headline' => 'Curated game cheats, spoofers & accounts',
                    'lede' => 'Hand-picked tools from vetted developers. Continuously updated. Instant drops. Support nearby.',
                    'cta_primary' => 'Browse Catalog',
                    'cta_secondary' => 'View Accounts',
                ],
            ];
        }
        return ['content' => [], 'settings' => []];
    }

    private function slugify(string $value): string
    {
        $value = mb_strtolower(trim($value));
        $value = preg_replace('/[^a-z0-9]+/', '-', $value) ?? '';
        return trim($value, '-');
    }

    private function toBool(mixed $v): bool
    {
        if (is_bool($v)) {
            return $v;
        }
        if (is_int($v) || is_float($v)) {
            return (int) $v === 1;
        }
        if (is_string($v)) {
            return in_array(strtolower($v), ['1', 'true', 'yes', 'on'], true);
        }
        return (bool) $v;
    }

    /** @param array<string, mixed> $row */
    private function normalize(array $row): array
    {
        $row['id'] = (int) $row['id'];
        $row['is_public'] = (int) ($row['is_public'] ?? 0) === 1;
        $row['noindex'] = (int) ($row['noindex'] ?? 0) === 1;
        $row['settings_json'] = $this->decodeJson($row['settings_json'] ?? null);
        $row['content_json'] = $this->decodeJson($row['content_json'] ?? null);
        return $row;
    }

    private function decodeJson(mixed $value): mixed
    {
        if ($value === null || $value === '') {
            return new \stdClass();
        }
        if (is_array($value) || is_object($value)) {
            return $value;
        }
        if (is_string($value)) {
            $decoded = json_decode($value, true);
            return json_last_error() === JSON_ERROR_NONE ? $decoded : new \stdClass();
        }
        return new \stdClass();
    }
}
