<?php
declare(strict_types=1);

namespace App\Platform\Adapters;

use App\Database;
use App\Modules\Mail\Mailer;
use App\Platform\Contracts\PlatformMailInterface;

final class MailAdapter implements PlatformMailInterface
{
    public function __construct(
        private Database $db,
        private array $app,
    ) {}

    public function sendHtml(string|array $to, string $subject, string $htmlBody, ?string $textBody = null): array
    {
        $settings = $this->loadMailSettings();
        $logDir = (string) (($this->app['paths']['storage'] ?? dirname(__DIR__, 3) . '/storage') . '/mail');
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

    /** @return array<string, mixed> */
    private function loadMailSettings(): array
    {
        try {
            $row = $this->db->one("SELECT value_json FROM settings WHERE `key`='mail' LIMIT 1");
            if ($row && !empty($row['value_json'])) {
                $decoded = json_decode((string) $row['value_json'], true);
                if (is_array($decoded)) {
                    return $decoded;
                }
            }
        } catch (\Throwable) {
        }
        return [];
    }
}
