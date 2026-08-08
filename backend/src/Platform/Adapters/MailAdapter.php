<?php
declare(strict_types=1);

namespace App\Platform\Adapters;

use App\Database;
use App\Modules\Mail\Mailer;
use App\Platform\Contracts\PlatformMailInterface;

/**
 * Host mail transport facade. Canonical SoT = modules.settings for name=mail
 * (same as MailModule / Plugins UI). Capability mail.send ≠ ready — use isAvailable().
 */
final class MailAdapter implements PlatformMailInterface
{
    public function __construct(
        private Database $db,
        private array $app,
    ) {}

    public function isAvailable(): bool
    {
        if (!class_exists(Mailer::class)) {
            return false;
        }
        try {
            $row = $this->db->one('SELECT is_enabled FROM modules WHERE name=? LIMIT 1', ['mail']);
            if ($row !== null && (int) ($row['is_enabled'] ?? 0) === 0) {
                return false;
            }
        } catch (\Throwable) {
            // modules table may be absent in early boots — fall through to settings check
        }
        return $this->settingsLookReady($this->loadMailSettings());
    }

    public function sendHtml(string|array $to, string $subject, string $htmlBody, ?string $textBody = null): array
    {
        if (!$this->isAvailable()) {
            return ['ok' => false, 'error' => 'Mail capability unavailable'];
        }
        $settings = $this->loadMailSettings();
        $storageRoot = (string) ($this->app['paths']['storage'] ?? $this->app['storage'] ?? dirname(__DIR__, 3) . '/storage');
        $logDir = rtrim($storageRoot, '/\\') . '/mail';
        if (!is_dir($logDir)) {
            @mkdir($logDir, 0775, true);
        }
        $mailer = new Mailer($settings, $logDir);
        $recipients = is_array($to) ? $to : [$to];
        try {
            foreach ($recipients as $addr) {
                $mailer->sendHtml((string) $addr, $subject, $htmlBody, null, $textBody);
            }
            return ['ok' => true];
        } catch (\Throwable $e) {
            return ['ok' => false, 'error' => $e->getMessage()];
        }
    }

    /**
     * Canonical: modules.settings JSON for plugin mail.
     * Fallback (read-only adoption): legacy email_settings — not a third write SoT.
     *
     * @return array<string, mixed>
     */
    private function loadMailSettings(): array
    {
        try {
            $row = $this->db->one('SELECT settings FROM modules WHERE name=? LIMIT 1', ['mail']);
            if ($row && !empty($row['settings'])) {
                $decoded = json_decode((string) $row['settings'], true);
                if (is_array($decoded) && trim((string) ($decoded['from_email'] ?? '')) !== '') {
                    return $decoded;
                }
            }
        } catch (\Throwable) {
        }

        try {
            $legacy = $this->db->one('SELECT * FROM email_settings WHERE id=1 LIMIT 1');
            if (is_array($legacy) && trim((string) ($legacy['from_email'] ?? '')) !== '') {
                return [
                    'from_email' => (string) ($legacy['from_email'] ?? ''),
                    'from_name' => (string) ($legacy['from_name'] ?? 'Jasefly'),
                    'to_email' => (string) ($legacy['to_email'] ?? ''),
                    'smtp_host' => (string) ($legacy['smtp_host'] ?? ''),
                    'smtp_port' => (int) ($legacy['smtp_port'] ?? 587),
                    'smtp_username' => (string) ($legacy['smtp_username'] ?? ''),
                    'smtp_password' => (string) ($legacy['smtp_password'] ?? ''),
                    'smtp_encryption' => (string) ($legacy['smtp_encryption'] ?? 'tls'),
                ];
            }
        } catch (\Throwable) {
        }

        return [];
    }

    /** @param array<string, mixed> $settings */
    private function settingsLookReady(array $settings): bool
    {
        $from = trim((string) ($settings['from_email'] ?? ''));
        $host = trim((string) ($settings['smtp_host'] ?? ''));
        return $from !== '' && $host !== '' && filter_var($from, FILTER_VALIDATE_EMAIL) !== false;
    }
}
