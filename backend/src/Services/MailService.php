<?php
declare(strict_types=1);

namespace App\Services;

use App\Database;
use App\Modules\Mail\Mailer;

/**
 * @deprecated Предпочитайте плагин Mail (App\Modules\Mail\Mailer).
 * Оставлен для совместимости: делегирует в новый Mailer, без mail().
 */
final class MailService
{
    public function __construct(private Database $db, private array $app) {}

    public function contact(array $data): void
    {
        $settings = $this->db->one('SELECT * FROM email_settings LIMIT 1') ?: [];
        $to = (string) ($settings['to_email'] ?? '');
        if ($to === '') {
            return;
        }

        $merged = [
            'from_email' => $settings['from_email'] ?? 'noreply@localhost',
            'from_name' => $settings['from_name'] ?? 'Portfolio',
            'to_email' => $to,
            'smtp_host' => $settings['smtp_host'] ?? '',
            'smtp_port' => (int) ($settings['smtp_port'] ?? 587),
            'smtp_encryption' => $settings['smtp_encryption'] ?? 'tls',
            'smtp_username' => $settings['smtp_username'] ?? '',
            'smtp_password' => $settings['smtp_password'] ?? '',
        ];

        $storage = (string) ($this->app['storage'] ?? dirname(__DIR__, 2) . '/storage');
        $mailer = new Mailer($merged, $storage . '/logs');
        $html = $mailer->buildContactHtml([
            'name' => (string) ($data['name'] ?? ''),
            'email' => (string) ($data['email'] ?? ''),
            'subject' => (string) ($data['subject'] ?? 'New contact message'),
            'message' => (string) ($data['message'] ?? ''),
        ]);
        $mailer->sendHtml(
            to: $to,
            subject: '[Portfolio] ' . ($data['subject'] ?? 'New contact message'),
            html: $html,
            replyTo: (string) ($data['email'] ?? ''),
        );
    }
}
