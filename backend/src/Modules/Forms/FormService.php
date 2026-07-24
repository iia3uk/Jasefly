<?php
declare(strict_types=1);

namespace App\Modules\Forms;

use App\Core\Container;
use App\Core\EventDispatcher;
use App\Database;

final class FormService
{
    public function __construct(
        private Database $db,
        private array $app = []
    ) {}

    public function publicId(): string
    {
        return strtolower(bin2hex(random_bytes(13)));
    }

    /** @return array<string, mixed>|null */
    public function getBySlug(string $slug, bool $activeOnly = true): ?array
    {
        $sql = 'SELECT * FROM forms WHERE slug=? AND deleted_at IS NULL';
        $params = [$slug];
        if ($activeOnly) {
            $sql .= " AND status='active'";
        }
        $form = $this->db->one($sql, $params);
        if (!$form) {
            return null;
        }
        $form['fields'] = $this->fields((int) $form['id']);
        $form['actions'] = $this->actions((int) $form['id']);
        return $form;
    }

    public function getById(int $id): ?array
    {
        $form = $this->db->one('SELECT * FROM forms WHERE id=? AND deleted_at IS NULL', [$id]);
        if (!$form) {
            return null;
        }
        $form['fields'] = $this->fields($id);
        $form['actions'] = $this->actions($id);
        return $form;
    }

    /** @return list<array<string, mixed>> */
    public function fields(int $formId): array
    {
        $rows = $this->db->all('SELECT * FROM form_fields WHERE form_id=? ORDER BY sort_order, id', [$formId]);
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

    /** @return list<array<string, mixed>> */
    public function actions(int $formId): array
    {
        return $this->db->all(
            'SELECT * FROM form_actions WHERE form_id=? ORDER BY sort_order, id',
            [$formId]
        );
    }

    /**
     * @param array<string, mixed> $input
     * @return array{ok:bool, error?:string, errors?:array, data?:array}
     */
    public function submit(string $slug, array $input, ?string $ip, ?string $ua): array
    {
        $form = $this->getBySlug($slug, true);
        if (!$form) {
            return ['ok' => false, 'error' => 'Form not found'];
        }
        $settings = $form['settings'] ?? [];
        if (is_string($settings)) {
            $settings = json_decode($settings, true) ?: [];
        }
        if (!is_array($settings)) {
            $settings = [];
        }

        // Honeypot
        if (!empty($settings['honeypot'])) {
            $hp = (string) ($input['website'] ?? $input['_hp'] ?? '');
            if ($hp !== '') {
                return ['ok' => true, 'data' => ['success' => true, 'message' => $form['success_message']]];
            }
        }

        // Timing check
        $started = (int) ($input['_started_at'] ?? 0);
        $minMs = (int) ($settings['timing_min_ms'] ?? 800);
        if ($started > 0 && (int) (microtime(true) * 1000) - $started < $minMs) {
            return ['ok' => false, 'error' => 'Too fast', 'errors' => ['_form' => 'Подождите немного']];
        }

        // Rate limit by IP hash
        $salt = (string) ($this->app['jwt_secret'] ?? 'jasefly');
        $ipHash = $ip ? hash_hmac('sha256', $ip, $salt) : null;
        $uaHash = $ua ? hash_hmac('sha256', $ua, $salt) : null;
        if ($ipHash) {
            $recent = $this->db->one(
                "SELECT COUNT(*) c FROM form_submissions WHERE form_id=? AND ip_hash=? AND created_at >= DATE_SUB(NOW(), INTERVAL 1 MINUTE)",
                [(int) $form['id'], $ipHash]
            );
            if ((int) ($recent['c'] ?? 0) >= 3) {
                return ['ok' => false, 'error' => 'Rate limited'];
            }
        }

        $values = is_array($input['values'] ?? null) ? $input['values'] : $input;
        unset($values['website'], $values['_hp'], $values['_started_at'], $values['csrf'], $values['captcha_token']);

        $result = FormValidator::validate($form['fields'] ?? [], $values);
        if (!$result['ok']) {
            return ['ok' => false, 'error' => 'Validation failed', 'errors' => $result['errors']];
        }

        // Drop hidden field values for storage honesty
        foreach ($result['visible'] as $name => $vis) {
            if (!$vis) {
                unset($values[$name]);
            }
        }

        $publicId = $this->publicId();
        $utm = [
            'utm_source' => $input['utm_source'] ?? null,
            'utm_medium' => $input['utm_medium'] ?? null,
            'utm_campaign' => $input['utm_campaign'] ?? null,
        ];
        $pageUrl = isset($input['page_url']) ? mb_substr((string) $input['page_url'], 0, 1024) : null;

        $this->db->run(
            'INSERT INTO form_submissions (public_id, form_id, status, page_url, utm, ip_hash, ua_hash)
             VALUES (?, ?, \'new\', ?, ?, ?, ?)',
            [
                $publicId,
                (int) $form['id'],
                $pageUrl,
                json_encode($utm, JSON_UNESCAPED_UNICODE),
                $ipHash,
                $uaHash,
            ]
        );
        $subId = (int) $this->db->id();

        $labelMap = [];
        foreach ($form['fields'] as $f) {
            $labelMap[(string) $f['name']] = (string) ($f['label'] ?? $f['name']);
        }
        foreach ($values as $k => $v) {
            if (!is_string($k)) {
                continue;
            }
            $text = is_scalar($v) ? (string) $v : json_encode($v, JSON_UNESCAPED_UNICODE);
            $this->db->run(
                'INSERT INTO form_submission_values (submission_id, field_name, field_label, value_text) VALUES (?, ?, ?, ?)',
                [$subId, $k, $labelMap[$k] ?? $k, $text]
            );
        }

        // Legacy mirror for contact form → contact_messages inbox
        if (($form['slug'] ?? '') === 'contact' && $this->tableExists('contact_messages')) {
            try {
                $this->db->run(
                    'INSERT INTO contact_messages (name, email, subject, message, is_read, created_at) VALUES (?, ?, ?, ?, 0, NOW())',
                    [
                        (string) ($values['name'] ?? ''),
                        (string) ($values['email'] ?? ''),
                        (string) ($values['subject'] ?? $form['name']),
                        (string) ($values['message'] ?? json_encode($values, JSON_UNESCAPED_UNICODE)),
                    ]
                );
            } catch (\Throwable) {
            }
        }

        $submission = [
            'id' => $subId,
            'public_id' => $publicId,
            'form_id' => (int) $form['id'],
            'values' => $values,
            'page_url' => $pageUrl,
        ];

        $this->dispatch('form.submitted', [
            'form_id' => (int) $form['id'],
            'form_slug' => $form['slug'],
            'submission_public_id' => $publicId,
            'values' => $values,
        ]);

        $extra = FormActionRegistry::runAll($this->db, $form, $submission, $form['actions'] ?? []);

        $redirect = $extra['redirect_url'] ?? $form['redirect_url'] ?? null;
        return [
            'ok' => true,
            'data' => [
                'success' => true,
                'public_id' => $publicId,
                'message' => $form['success_message'] ?: 'Спасибо!',
                'redirect_url' => $redirect ?: null,
            ],
        ];
    }

    private function tableExists(string $table): bool
    {
        try {
            return $this->db->inspector()->tableExists($table);
        } catch (\Throwable) {
            return false;
        }
    }

    private function dispatch(string $event, array $payload): void
    {
        try {
            $c = Container::getInstance();
            if ($c->has(EventDispatcher::class)) {
                $c->get(EventDispatcher::class)->dispatch($event, $payload);
            }
        } catch (\Throwable) {
        }
    }
}
