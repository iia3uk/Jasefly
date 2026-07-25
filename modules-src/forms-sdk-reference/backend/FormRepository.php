<?php
declare(strict_types=1);

namespace App\PackageModules\FormsSdkReference;

use App\Platform\Contracts\PlatformDatabaseInterface;

final class FormRepository
{
    public function __construct(private PlatformDatabaseInterface $db) {}

    /** @return list<array<string, mixed>> */
    public function listForms(): array
    {
        return $this->db->all(
            "SELECT f.*, (SELECT COUNT(*) FROM fsr_form_submissions s WHERE s.form_id=f.id AND s.deleted_at IS NULL) submissions_count
             FROM fsr_forms f WHERE f.deleted_at IS NULL ORDER BY f.id DESC"
        );
    }

    /** @return array<string, mixed>|null */
    public function getById(int $id): ?array
    {
        $form = $this->db->one('SELECT * FROM fsr_forms WHERE id=? AND deleted_at IS NULL', [$id]);
        if (!$form) {
            return null;
        }
        $form['fields'] = $this->fields($id);
        return $this->decodeFormJson($form);
    }

    /** @return array<string, mixed>|null */
    public function getBySlug(string $slug, bool $activeOnly = true): ?array
    {
        $sql = 'SELECT * FROM fsr_forms WHERE slug=? AND deleted_at IS NULL';
        $params = [$slug];
        if ($activeOnly) {
            $sql .= " AND status='active'";
        }
        $form = $this->db->one($sql, $params);
        if (!$form) {
            return null;
        }
        $form['fields'] = $this->fields((int) $form['id']);
        return $this->decodeFormJson($form);
    }

    /** @return list<array<string, mixed>> */
    public function fields(int $formId): array
    {
        $rows = $this->db->all(
            'SELECT * FROM fsr_form_fields WHERE form_id=? ORDER BY sort_order, id',
            [$formId]
        );
        foreach ($rows as &$row) {
            foreach (['validation', 'options', 'visibility'] as $k) {
                if (isset($row[$k]) && is_string($row[$k])) {
                    $row[$k] = json_decode($row[$k], true);
                }
            }
        }
        unset($row);
        return $rows;
    }

    /**
     * @param array<string, mixed> $input
     * @param list<array<string, mixed>> $fields
     */
    public function create(array $input, array $fields): int
    {
        $name = trim((string) ($input['name'] ?? 'Форма'));
        $slug = trim((string) ($input['slug'] ?? ''));
        if ($slug === '') {
            $slug = preg_replace('/[^a-z0-9\-]+/', '-', strtolower($name)) ?: 'form';
        }
        $status = $this->normalizeStatus((string) ($input['status'] ?? 'draft'));
        $this->db->run(
            'INSERT INTO fsr_forms (name, slug, description, status, success_message, redirect_url, submit_button_text, settings)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            [
                $name,
                $slug,
                $input['description'] ?? null,
                $status,
                $input['success_message'] ?? 'Спасибо!',
                $input['redirect_url'] ?? null,
                $input['submit_button_text'] ?? 'Отправить',
                json_encode($input['settings'] ?? ['honeypot' => true, 'timing_min_ms' => 800], JSON_UNESCAPED_UNICODE),
            ]
        );
        $id = $this->db->lastInsertId();
        $this->syncFields($id, $fields);
        return $id;
    }

    /**
     * @param array<string, mixed> $input
     * @param list<array<string, mixed>>|null $fields
     */
    public function update(int $id, array $input, ?array $fields = null): bool
    {
        $form = $this->getById($id);
        if (!$form) {
            return false;
        }
        $status = $this->normalizeStatus((string) ($input['status'] ?? $form['status']));
        $this->db->run(
            'UPDATE fsr_forms SET name=?, slug=?, description=?, status=?, success_message=?, redirect_url=?, submit_button_text=?, settings=? WHERE id=?',
            [
                trim((string) ($input['name'] ?? $form['name'])),
                trim((string) ($input['slug'] ?? $form['slug'])),
                $input['description'] ?? $form['description'],
                $status,
                $input['success_message'] ?? $form['success_message'],
                $input['redirect_url'] ?? $form['redirect_url'],
                $input['submit_button_text'] ?? $form['submit_button_text'],
                json_encode($input['settings'] ?? $form['settings'], JSON_UNESCAPED_UNICODE),
                $id,
            ]
        );
        if ($fields !== null) {
            $this->syncFields($id, $fields);
        }
        return true;
    }

    public function delete(int $id): void
    {
        $this->db->run("UPDATE fsr_forms SET deleted_at=NOW(), status='archived' WHERE id=?", [$id]);
    }

    /** @param list<array<string, mixed>> $fields */
    public function syncFields(int $formId, array $fields): void
    {
        $this->db->run('DELETE FROM fsr_form_fields WHERE form_id=?', [$formId]);
        $order = 0;
        foreach ($fields as $f) {
            if (!is_array($f) || empty($f['name'])) {
                continue;
            }
            $order += 10;
            $this->db->run(
                'INSERT INTO fsr_form_fields (form_id, name, label, type, placeholder, help_text, default_value, required, validation, options, width, sort_order, visibility)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                [
                    $formId,
                    (string) $f['name'],
                    (string) ($f['label'] ?? $f['name']),
                    (string) ($f['type'] ?? 'text'),
                    $f['placeholder'] ?? null,
                    $f['help_text'] ?? null,
                    isset($f['default_value']) ? (string) $f['default_value'] : null,
                    !empty($f['required']) ? 1 : 0,
                    json_encode($f['validation'] ?? new \stdClass(), JSON_UNESCAPED_UNICODE),
                    json_encode($f['options'] ?? null, JSON_UNESCAPED_UNICODE),
                    (string) ($f['width'] ?? 'full'),
                    (int) ($f['sort_order'] ?? $order),
                    json_encode($f['visibility'] ?? null, JSON_UNESCAPED_UNICODE),
                ]
            );
        }
    }

    /** @return list<array<string, mixed>> */
    public function listSubmissions(int $formId = 0, string $status = ''): array
    {
        $sql = 'SELECT s.id, s.public_id, s.form_id, s.status, s.page_url, s.created_at, s.updated_at,
                       f.name form_name, f.slug form_slug
                FROM fsr_form_submissions s
                LEFT JOIN fsr_forms f ON f.id=s.form_id
                WHERE s.deleted_at IS NULL';
        $params = [];
        if ($formId > 0) {
            $sql .= ' AND s.form_id=?';
            $params[] = $formId;
        }
        if ($status !== '') {
            $sql .= ' AND s.status=?';
            $params[] = $status;
        }
        $sql .= ' ORDER BY s.id DESC LIMIT 200';
        return $this->db->all($sql, $params);
    }

    /** @return array<string, mixed>|null */
    public function getSubmission(int $id): ?array
    {
        $sub = $this->db->one('SELECT * FROM fsr_form_submissions WHERE id=? AND deleted_at IS NULL', [$id]);
        if (!$sub) {
            return null;
        }
        $sub['values'] = $this->db->all(
            'SELECT * FROM fsr_form_submission_values WHERE submission_id=?',
            [$id]
        );
        unset($sub['ip_hash'], $sub['ua_hash']);
        return $sub;
    }

    public function updateSubmission(int $id, string $status, ?string $note): bool
    {
        $sub = $this->db->one('SELECT * FROM fsr_form_submissions WHERE id=? AND deleted_at IS NULL', [$id]);
        if (!$sub) {
            return false;
        }
        if (!in_array($status, ['new', 'in_progress', 'resolved', 'spam', 'archived'], true)) {
            return false;
        }
        $this->db->run(
            'UPDATE fsr_form_submissions SET status=?, internal_note=COALESCE(?, internal_note) WHERE id=?',
            [$status, $note, $id]
        );
        return true;
    }

    /** @param list<int|string> $ids */
    public function bulkStatus(array $ids, string $status): int
    {
        if (!in_array($status, ['new', 'in_progress', 'resolved', 'spam', 'archived'], true)) {
            return 0;
        }
        $count = 0;
        foreach ($ids as $sid) {
            $this->db->run(
                'UPDATE fsr_form_submissions SET status=? WHERE id=? AND deleted_at IS NULL',
                [$status, (int) $sid]
            );
            $count++;
        }
        return $count;
    }

    public function deleteSubmission(int $id): void
    {
        $this->db->run("UPDATE fsr_form_submissions SET deleted_at=NOW(), status='archived' WHERE id=?", [$id]);
    }

    /** @return list<array<string, mixed>> */
    public function submissionsForExport(int $formId): array
    {
        return $this->db->all(
            'SELECT * FROM fsr_form_submissions WHERE form_id=? AND deleted_at IS NULL ORDER BY id DESC LIMIT 5000',
            [$formId]
        );
    }

    /** @return array<string, string> */
    public function submissionValueMap(int $submissionId): array
    {
        $vals = $this->db->all(
            'SELECT field_name, value_text FROM fsr_form_submission_values WHERE submission_id=?',
            [$submissionId]
        );
        $map = [];
        foreach ($vals as $v) {
            $map[(string) $v['field_name']] = (string) ($v['value_text'] ?? '');
        }
        return $map;
    }

    public function publicId(): string
    {
        return strtolower(bin2hex(random_bytes(13)));
    }

    private function normalizeStatus(string $status): string
    {
        return in_array($status, ['draft', 'active', 'disabled', 'archived'], true) ? $status : 'draft';
    }

    /** @param array<string, mixed> $form */
    private function decodeFormJson(array $form): array
    {
        if (isset($form['settings']) && is_string($form['settings'])) {
            $form['settings'] = json_decode($form['settings'], true) ?: [];
        }
        return $form;
    }
}
