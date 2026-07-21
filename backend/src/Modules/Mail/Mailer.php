<?php
declare(strict_types=1);

namespace App\Modules\Mail;

/**
 * Универсальный SMTP-отправитель HTML-писем.
 *
 * Не использует PHP-функцию mail(). Работает через сокет SMTP
 * (Mail.ru / Яндекс 360 / Mailgun / Brevo / любой SMTP).
 *
 * Пример:
 *   $mailer = new Mailer($settings, $logDir);
 *   $mailer->sendHtml(
 *       to: 'owner@example.com',
 *       subject: 'Новое сообщение',
 *       html: '<p>Привет</p>',
 *       replyTo: 'user@example.com'
 *   );
 */
final class Mailer
{
    /** @param array<string, mixed> $settings SMTP и From/To из настроек плагина */
    public function __construct(
        private array $settings,
        private string $logDir,
    ) {}

    /**
     * Отправить HTML-письмо.
     *
     * @throws \RuntimeException при ошибке SMTP (детали уже в логе)
     */
    public function sendHtml(
        string $to,
        string $subject,
        string $html,
        ?string $replyTo = null,
        ?string $textAlt = null,
    ): void {
        $to = $this->sanitizeHeaderEmail($to);
        $fromEmail = $this->sanitizeHeaderEmail((string) ($this->settings['from_email'] ?? ''));
        $fromName = $this->sanitizeHeaderText((string) ($this->settings['from_name'] ?? 'Jasefly CMS'));
        $replyTo = $replyTo !== null && $replyTo !== ''
            ? $this->sanitizeHeaderEmail($replyTo)
            : $fromEmail;

        if ($to === '' || $fromEmail === '') {
            throw new \RuntimeException('Mailer: не заданы from_email или получатель');
        }

        $subject = $this->sanitizeHeaderText($subject);
        $textAlt = $textAlt ?? trim(html_entity_decode(strip_tags($html), ENT_QUOTES | ENT_HTML5, 'UTF-8'));
        $boundary = 'b_' . bin2hex(random_bytes(12));

        // MIME multipart: text/plain + text/html
        $body = "--{$boundary}\r\n"
            . "Content-Type: text/plain; charset=UTF-8\r\n"
            . "Content-Transfer-Encoding: base64\r\n\r\n"
            . chunk_split(base64_encode($textAlt)) . "\r\n"
            . "--{$boundary}\r\n"
            . "Content-Type: text/html; charset=UTF-8\r\n"
            . "Content-Transfer-Encoding: base64\r\n\r\n"
            . chunk_split(base64_encode($html)) . "\r\n"
            . "--{$boundary}--\r\n";

        $encodedSubject = '=?UTF-8?B?' . base64_encode($subject) . '?=';
        $encodedFromName = '=?UTF-8?B?' . base64_encode($fromName) . '?=';

        $headers = [
            "From: {$encodedFromName} <{$fromEmail}>",
            "To: <{$to}>",
            "Reply-To: <{$replyTo}>",
            "Subject: {$encodedSubject}",
            'MIME-Version: 1.0',
            "Content-Type: multipart/alternative; boundary=\"{$boundary}\"",
            'X-Mailer: JaseflyCMS',
            'Date: ' . gmdate('D, d M Y H:i:s') . ' +0000',
            'Message-ID: <' . bin2hex(random_bytes(16)) . '@' . ($this->settings['smtp_host'] ?? 'localhost') . '>',
        ];

        $host = trim((string) ($this->settings['smtp_host'] ?? ''));
        if ($host === '') {
            $this->log('error', 'SMTP хост не задан — отправка невозможна (mail() запрещён)');
            throw new \RuntimeException('SMTP не настроен');
        }

        $this->smtpSend($to, $fromEmail, $headers, $body);
    }

    /**
     * Собрать безопасный HTML из полей формы обратной связи.
     * Все пользовательские данные экранируются (защита от XSS в письме).
     *
     * @param array{name: string, email: string, message: string, subject?: string} $data
     */
    public function buildContactHtml(array $data): string
    {
        $name = htmlspecialchars($data['name'], ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
        $email = htmlspecialchars($data['email'], ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
        $subject = htmlspecialchars((string) ($data['subject'] ?? 'Сообщение с сайта'), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
        // nl2br после escape — переносы строк безопасны
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

    /**
     * SMTP-диалог: EHLO → STARTTLS/SSL → AUTH LOGIN → DATA.
     *
     * @param list<string> $headers
     */
    private function smtpSend(string $to, string $from, array $headers, string $body): void
    {
        $host = trim((string) $this->settings['smtp_host']);
        $port = (int) ($this->settings['smtp_port'] ?? 587);
        $encryption = strtolower((string) ($this->settings['smtp_encryption'] ?? 'tls'));
        $username = (string) ($this->settings['smtp_username'] ?? '');
        $password = (string) ($this->settings['smtp_password'] ?? '');

        $remote = ($encryption === 'ssl' ? 'ssl://' : '') . $host;
        $fp = @fsockopen($remote, $port, $errno, $errstr, 20);
        if (!$fp) {
            $this->log('error', "SMTP connect failed: {$errstr} ({$errno}) host={$host}:{$port}");
            throw new \RuntimeException('Не удалось подключиться к SMTP');
        }

        stream_set_timeout($fp, 20);

        try {
            $this->expect($fp, [220], 'banner');
            $this->cmd($fp, 'EHLO JaseflyCMS', [250]);

            if ($encryption === 'tls') {
                $this->cmd($fp, 'STARTTLS', [220]);
                if (!stream_socket_enable_crypto($fp, true, STREAM_CRYPTO_METHOD_TLS_CLIENT)) {
                    throw new \RuntimeException('STARTTLS не удался');
                }
                $this->cmd($fp, 'EHLO JaseflyCMS', [250]);
            }

            if ($username !== '') {
                $this->cmd($fp, 'AUTH LOGIN', [334]);
                $this->cmd($fp, base64_encode($username), [334]);
                $this->cmd($fp, base64_encode($password), [235]);
            }

            $this->cmd($fp, 'MAIL FROM:<' . $from . '>', [250]);
            $this->cmd($fp, 'RCPT TO:<' . $to . '>', [250, 251]);
            $this->cmd($fp, 'DATA', [354]);

            $payload = implode("\r\n", $headers) . "\r\n\r\n" . $body;
            // Точка в начале строки экранируется по SMTP (transparency)
            $payload = preg_replace('/^\./m', '..', $payload) ?? $payload;
            fwrite($fp, $payload . "\r\n.\r\n");
            $this->expect($fp, [250], 'DATA end');

            $this->cmd($fp, 'QUIT', [221, 250]);
            $this->log('info', "Письмо отправлено на {$to} через {$host}:{$port}");
        } catch (\Throwable $e) {
            $this->log('error', 'SMTP: ' . $e->getMessage());
            throw $e;
        } finally {
            fclose($fp);
        }
    }

    /** @param list<int> $okCodes */
    private function cmd($fp, string $line, array $okCodes): void
    {
        fwrite($fp, $line . "\r\n");
        $this->expect($fp, $okCodes, $line);
    }

    /** @param list<int> $okCodes */
    private function expect($fp, array $okCodes, string $ctx): void
    {
        $response = '';
        while (($line = fgets($fp, 515)) !== false) {
            $response .= $line;
            // Многострочный ответ SMTP: "250-…" продолжается, "250 …" конец
            if (isset($line[3]) && $line[3] === ' ') {
                break;
            }
        }
        $code = (int) substr($response, 0, 3);
        if (!in_array($code, $okCodes, true)) {
            throw new \RuntimeException("SMTP {$ctx}: ожидалось " . implode('/', $okCodes) . ", получено {$code}: " . trim($response));
        }
    }

    /** Защита от подделки SMTP-заголовков (\r \n в значениях). */
    private function sanitizeHeaderText(string $value): string
    {
        $value = str_replace(["\r", "\n", "\0"], '', $value);
        return trim($value);
    }

    private function sanitizeHeaderEmail(string $email): string
    {
        $email = $this->sanitizeHeaderText($email);
        // Оставляем только валидный одиночный адрес
        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
            return '';
        }
        return $email;
    }

    private function log(string $level, string $message): void
    {
        if ($this->logDir === '') {
            return;
        }
        if (!is_dir($this->logDir)) {
            @mkdir($this->logDir, 0775, true);
        }
        $line = sprintf("[%s] [%s] %s\n", gmdate('Y-m-d H:i:s'), strtoupper($level), $message);
        @file_put_contents(rtrim($this->logDir, '/\\') . '/mail.log', $line, FILE_APPEND | LOCK_EX);
    }
}
