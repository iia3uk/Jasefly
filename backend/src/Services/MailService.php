<?php
declare(strict_types=1);

namespace App\Services;

use App\Database;
use App\Platform\Adapters\MailAdapter;

/**
 * @deprecated Prefer Mail plugin / PlatformMailInterface ($ctx->mail()).
 * Legacy public contact endpoint helper — sends via Platform MailAdapter (not concrete Mailer).
 */
final class MailService
{
    public function __construct(private Database $db, private array $app) {}

    public function contact(array $data): void
    {
        $mail = new MailAdapter($this->db, $this->app);
        if (!$mail->isAvailable()) {
            return;
        }

        $to = $this->resolveNotifyTo();
        if ($to === '' || !filter_var($to, FILTER_VALIDATE_EMAIL)) {
            return;
        }

        $subject = '[Portfolio] ' . (string) ($data['subject'] ?? 'New contact message');
        $html = $this->buildContactHtml([
            'name' => (string) ($data['name'] ?? ''),
            'email' => (string) ($data['email'] ?? ''),
            'subject' => (string) ($data['subject'] ?? 'New contact message'),
            'message' => (string) ($data['message'] ?? ''),
        ]);
        $mail->sendHtml($to, $subject, $html);
    }

    /**
     * Same SoT as MailAdapter: modules.settings (mail), then legacy email_settings.
     */
    private function resolveNotifyTo(): string
    {
        try {
            $row = $this->db->one('SELECT settings FROM modules WHERE name=? LIMIT 1', ['mail']);
            if ($row && !empty($row['settings'])) {
                $decoded = json_decode((string) $row['settings'], true);
                if (is_array($decoded)) {
                    $to = trim((string) ($decoded['to_email'] ?? $decoded['notify_to'] ?? $decoded['from_email'] ?? ''));
                    if ($to !== '') {
                        return $to;
                    }
                }
            }
        } catch (\Throwable) {
        }

        try {
            $legacy = $this->db->one('SELECT to_email, from_email FROM email_settings WHERE id=1 LIMIT 1');
            if (is_array($legacy)) {
                $to = trim((string) ($legacy['to_email'] ?? ''));
                if ($to !== '') {
                    return $to;
                }
                return trim((string) ($legacy['from_email'] ?? ''));
            }
        } catch (\Throwable) {
        }

        return '';
    }

    /** @param array{name: string, email: string, message: string, subject?: string} $data */
    private function buildContactHtml(array $data): string
    {
        $name = htmlspecialchars($data['name'], ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
        $email = htmlspecialchars($data['email'], ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
        $subject = htmlspecialchars((string) ($data['subject'] ?? 'Сообщение с сайта'), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
        $message = nl2br(htmlspecialchars($data['message'], ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8'), false);

        return <<<HTML
<!DOCTYPE html>
<html lang="ru">
<head><meta charset="UTF-8"><title>{$subject}</title></head>
<body style="font-family:system-ui,sans-serif;line-height:1.5;color:#111;padding:24px;">
  <h2 style="margin:0 0 16px;">Новое сообщение с сайта</h2>
  <p style="margin:0 0 8px;"><strong>Имя:</strong> {$name}</p>
  <p style="margin:0 0 8px;"><strong>Email:</strong> <a href="mailto:{$email}">{$email}</a></p>
  <p style="margin:0 0 16px;"><strong>Тема:</strong> {$subject}</p>
  <div style="border-top:1px solid #ddd;padding-top:16px;">{$message}</div>
</body>
</html>
HTML;
    }
}
