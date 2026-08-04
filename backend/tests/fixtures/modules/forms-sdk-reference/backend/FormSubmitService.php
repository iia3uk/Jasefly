<?php
declare(strict_types=1);

namespace App\PackageModules\FormsSdkReference;

use App\Platform\PlatformContext;

final class FormSubmitService
{
    public function __construct(
        private PlatformContext $ctx,
        private FormRepository $repo,
    ) {}

    /**
     * @param array<string, mixed> $input
     * @return array{ok:bool, error?:string, errors?:array<string,string>, data?:array<string,mixed>}
     */
    public function submit(string $slug, array $input, ?string $ip, ?string $ua): array
    {
        $form = $this->repo->getBySlug($slug, true);
        if (!$form) {
            return ['ok' => false, 'error' => 'Form not found'];
        }

        $settings = is_array($form['settings'] ?? null) ? $form['settings'] : [];
        if (is_string($form['settings'] ?? null)) {
            $settings = json_decode((string) $form['settings'], true) ?: [];
        }

        if (!empty($settings['honeypot'])) {
            $hp = (string) ($input['website'] ?? $input['_hp'] ?? '');
            if ($hp !== '') {
                return [
                    'ok' => true,
                    'data' => [
                        'success' => true,
                        'message' => $form['success_message'] ?: 'Спасибо!',
                    ],
                ];
            }
        }

        $started = (int) ($input['_started_at'] ?? 0);
        $minMs = (int) ($settings['timing_min_ms'] ?? 800);
        if ($started > 0 && (int) (microtime(true) * 1000) - $started < $minMs) {
            return ['ok' => false, 'error' => 'Too fast', 'errors' => ['_form' => 'Подождите немного']];
        }

        $salt = (string) ($this->ctx->config()->get('jwt_secret') ?? 'jasefly');
        $ipHash = $ip ? hash_hmac('sha256', $ip, $salt) : null;
        $uaHash = $ua ? hash_hmac('sha256', $ua, $salt) : null;
        $db = $this->ctx->database();

        if ($ipHash) {
            $recent = $db->one(
                'SELECT COUNT(*) c FROM fsr_form_submissions WHERE form_id=? AND ip_hash=? AND created_at >= DATE_SUB(NOW(), INTERVAL 1 MINUTE)',
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

        foreach ($result['visible'] as $name => $vis) {
            if (!$vis) {
                unset($values[$name]);
            }
        }

        $publicId = $this->repo->publicId();
        $utm = [
            'utm_source' => $input['utm_source'] ?? null,
            'utm_medium' => $input['utm_medium'] ?? null,
            'utm_campaign' => $input['utm_campaign'] ?? null,
        ];
        $pageUrl = isset($input['page_url']) ? mb_substr((string) $input['page_url'], 0, 1024) : null;

        $subId = $db->transaction(function () use ($db, $publicId, $form, $pageUrl, $utm, $ipHash, $uaHash, $values): int {
            $db->run(
                'INSERT INTO fsr_form_submissions (public_id, form_id, status, page_url, utm, ip_hash, ua_hash)
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
            $subId = $db->lastInsertId();

            $labelMap = [];
            foreach ($form['fields'] as $f) {
                $labelMap[(string) $f['name']] = (string) ($f['label'] ?? $f['name']);
            }
            foreach ($values as $k => $v) {
                if (!is_string($k)) {
                    continue;
                }
                $text = is_scalar($v) ? (string) $v : json_encode($v, JSON_UNESCAPED_UNICODE);
                $db->run(
                    'INSERT INTO fsr_form_submission_values (submission_id, field_name, field_label, value_text) VALUES (?, ?, ?, ?)',
                    [$subId, $k, $labelMap[$k] ?? $k, $text]
                );
            }
            return $subId;
        });

        $this->ctx->events()->publish('forms-ref.submitted', [
            'form_id' => (int) $form['id'],
            'form_slug' => $form['slug'],
            'submission_id' => $subId,
            'public_id' => $publicId,
            'values' => $values,
        ]);

        $this->notify($form, $values, $publicId);

        return [
            'ok' => true,
            'data' => [
                'success' => true,
                'public_id' => $publicId,
                'message' => $form['success_message'] ?: 'Спасибо!',
                'redirect_url' => $form['redirect_url'] ?: null,
            ],
        ];
    }

    /** @param array<string, mixed> $form @param array<string, mixed> $values */
    private function notify(array $form, array $values, string $publicId): void
    {
        $notifyEmail = $this->ctx->settings()->get('notify_email');
        if ($notifyEmail && $this->ctx->capabilities()->has('mail.send')) {
            $lines = [];
            foreach ($values as $k => $v) {
                $lines[] = htmlspecialchars((string) $k) . ': ' . htmlspecialchars(is_scalar($v) ? (string) $v : json_encode($v));
            }
            $html = '<p>Новая заявка <strong>' . htmlspecialchars((string) $form['name']) . '</strong> (' . htmlspecialchars($publicId) . ')</p><ul><li>'
                . implode('</li><li>', $lines) . '</li></ul>';
            $this->ctx->mail()->sendHtml(
                is_array($notifyEmail) ? $notifyEmail : (string) $notifyEmail,
                'Заявка: ' . (string) $form['name'],
                $html
            );
        }

        if ($this->ctx->capabilities()->has('notifications.send')) {
            $summary = [];
            foreach (array_slice($values, 0, 3) as $k => $v) {
                $summary[] = (string) $k . ': ' . (is_scalar($v) ? (string) $v : json_encode($v));
            }
            $this->ctx->notifications()->notifyAdmins(
                'forms-ref.submitted',
                'Заявка: ' . (string) $form['name'],
                implode("\n", $summary),
                ['form_slug' => $form['slug'], 'public_id' => $publicId]
            );
        }
    }
}
