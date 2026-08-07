<?php
declare(strict_types=1);

namespace App\Support;

use App\Database;
use App\Request;
use App\Services\SiteUpdater;

/**
 * Opt-in human gate for CMS update ZIP via Telegram inline buttons.
 * Secrets (bot token, chat id, webhook secret) come only from app/.env — never Mail DB / mcp-cms.
 * Smoke-tested via cms_release → pending_approval → Telegram Approve.
 */
final class DeployTelegramApprove
{
    private string $pendingDir;

    /** @param array<string, mixed> $app */
    public function __construct(
        private array $app,
        private ?Database $db = null,
    ) {
        $storage = (string) ($app['storage'] ?? (dirname(__DIR__, 2) . '/storage'));
        $this->pendingDir = rtrim($storage, '/\\') . DIRECTORY_SEPARATOR . 'updates' . DIRECTORY_SEPARATOR . 'pending';
    }

    /** @param array<string, mixed> $app */
    public static function enabled(array $app): bool
    {
        $v = strtolower(trim((string) ($app['telegram_deploy_approve'] ?? '0')));
        return in_array($v, ['1', 'true', 'yes', 'on'], true);
    }

    /** @param array<string, mixed> $app */
    public static function configured(array $app): bool
    {
        return self::botToken($app) !== ''
            && self::chatId($app) !== ''
            && self::webhookSecret($app) !== '';
    }

    /** @param array<string, mixed> $app */
    public static function assertConfigured(array $app): void
    {
        if (!self::configured($app)) {
            throw new \RuntimeException(
                'TELEGRAM_DEPLOY_APPROVE включён, но не заданы TELEGRAM_DEPLOY_BOT_TOKEN / '
                . 'TELEGRAM_DEPLOY_CHAT_ID / TELEGRAM_DEPLOY_WEBHOOK_SECRET в api/config/.env'
            );
        }
    }

    /** @param array<string, mixed> $app */
    public static function botToken(array $app): string
    {
        return trim((string) ($app['telegram_deploy_bot_token'] ?? ''));
    }

    /** @param array<string, mixed> $app */
    public static function chatId(array $app): string
    {
        return trim((string) ($app['telegram_deploy_chat_id'] ?? ''));
    }

    /** @param array<string, mixed> $app */
    public static function webhookSecret(array $app): string
    {
        return trim((string) ($app['telegram_deploy_webhook_secret'] ?? ''));
    }

    /** Public status — never includes secrets. */
    public function statusPublic(): array
    {
        return [
            'enabled' => self::enabled($this->app),
            'configured' => self::configured($this->app),
            'pending' => $this->listPendingSummaries(),
        ];
    }

    /**
     * Stage uploaded ZIP and notify Telegram. Does not apply.
     *
     * @param array{name?:string,type?:string,tmp_name?:string,error?:int,size?:int} $file
     * @return array<string, mixed>
     */
    public function stageUpload(array $file, string $requestedBy = 'admin'): array
    {
        self::assertConfigured($this->app);

        $err = (int) ($file['error'] ?? UPLOAD_ERR_NO_FILE);
        if ($err !== UPLOAD_ERR_OK) {
            throw new \RuntimeException($this->uploadErrorMessage($err));
        }
        $tmp = (string) ($file['tmp_name'] ?? '');
        $size = (int) ($file['size'] ?? 0);
        $name = (string) ($file['name'] ?? 'update.zip');
        if ($tmp === '' || !is_uploaded_file($tmp)) {
            throw new \RuntimeException('Файл обновления не получен.');
        }
        if ($size <= 0 || $size > SiteUpdater::MAX_ZIP_BYTES) {
            throw new \RuntimeException(
                'ZIP слишком большой (лимит ' . (int) (SiteUpdater::MAX_ZIP_BYTES / 1048576) . ' МБ) или пустой.'
            );
        }
        if (!preg_match('/\.zip$/i', $name)) {
            throw new \RuntimeException('Нужен файл .zip (пакет update с локальной сборки).');
        }

        $this->ensurePendingDir();
        $this->expireStale();

        $id = bin2hex(random_bytes(16));
        $zipPath = $this->zipPath($id);
        if (!@move_uploaded_file($tmp, $zipPath)) {
            throw new \RuntimeException('Не удалось сохранить ZIP в pending.');
        }

        $ttl = max(120, (int) ($this->app['telegram_deploy_ttl_seconds'] ?? 3600));
        $meta = [
            'id' => $id,
            'package' => $name,
            'sha256' => hash_file('sha256', $zipPath) ?: '',
            'size' => $size,
            'created_at' => gmdate('c'),
            'expires_at' => gmdate('c', time() + $ttl),
            'status' => 'pending',
            'requested_by' => $requestedBy === 'mcp' ? 'mcp' : 'admin',
            'message_id' => null,
            'chat_id' => self::chatId($this->app),
        ];
        $this->writeMeta($id, $meta);

        try {
            $this->ensureWebhook();
            $messageId = $this->notifyPending($meta);
            $meta['message_id'] = $messageId;
            $this->writeMeta($id, $meta);
        } catch (\Throwable $e) {
            @unlink($zipPath);
            @unlink($this->metaPath($id));
            throw new \RuntimeException('Pending сохранён, но Telegram недоступен: ' . $e->getMessage(), 0, $e);
        }

        return [
            'ok' => true,
            'pending_approval' => true,
            'deploy_id' => $id,
            'package' => $name,
            'expires_at' => $meta['expires_at'],
            'sha256' => $meta['sha256'],
            'message' => 'Пакет на хосте. Подтвердите Apply в Telegram (или Approve в админке Updates).',
        ];
    }

    /**
     * @return array<string, mixed>
     */
    public function approve(string $id, string $via = 'admin'): array
    {
        $meta = $this->loadMeta($id);
        if ($meta === null) {
            throw new \RuntimeException('Pending deploy не найден.', 404);
        }
        if (($meta['status'] ?? '') !== 'pending') {
            throw new \RuntimeException('Deploy уже обработан (' . ($meta['status'] ?? '?') . ').', 409);
        }
        if ($this->isExpired($meta)) {
            $this->markStatus($id, 'expired');
            @unlink($this->zipPath($id));
            throw new \RuntimeException('Pending deploy протух (TTL).', 410);
        }

        $zipPath = $this->zipPath($id);
        if (!is_file($zipPath)) {
            $this->markStatus($id, 'expired');
            throw new \RuntimeException('ZIP pending отсутствует на диске.', 410);
        }

        $updater = new SiteUpdater($this->app, $this->db);
        $result = $updater->applyStagedZip($zipPath, (string) ($meta['package'] ?? 'update.zip'));
        @unlink($zipPath);

        $meta['status'] = 'applied';
        $meta['applied_at'] = gmdate('c');
        $meta['applied_via'] = $via;
        $meta['result'] = [
            'ok' => $result['ok'] ?? true,
            'files_copied' => $result['files_copied'] ?? 0,
            'package' => $result['package'] ?? null,
        ];
        $this->writeMeta($id, $meta);

        $this->editMessage(
            (int) ($meta['message_id'] ?? 0),
            "✅ Deploy применён ({$via})\n"
            . '📦 ' . ($meta['package'] ?? '') . "\n"
            . 'id: `' . $id . "`\n"
            . 'files: ' . (string) ($result['files_copied'] ?? 0)
        );

        return array_merge($result, [
            'pending_approval' => false,
            'deploy_id' => $id,
            'applied_via' => $via,
        ]);
    }

    /** @return array<string, mixed> */
    public function reject(string $id, string $via = 'admin'): array
    {
        $meta = $this->loadMeta($id);
        if ($meta === null) {
            throw new \RuntimeException('Pending deploy не найден.', 404);
        }
        if (($meta['status'] ?? '') !== 'pending') {
            throw new \RuntimeException('Deploy уже обработан (' . ($meta['status'] ?? '?') . ').', 409);
        }
        @unlink($this->zipPath($id));
        $meta['status'] = 'rejected';
        $meta['rejected_at'] = gmdate('c');
        $meta['rejected_via'] = $via;
        $this->writeMeta($id, $meta);

        $this->editMessage(
            (int) ($meta['message_id'] ?? 0),
            "❌ Deploy отклонён ({$via})\n"
            . '📦 ' . ($meta['package'] ?? '') . "\n"
            . 'id: `' . $id . '`'
        );

        return [
            'ok' => true,
            'pending_approval' => false,
            'deploy_id' => $id,
            'status' => 'rejected',
            'message' => 'Pending deploy отклонён.',
        ];
    }

    /**
     * Telegram webhook handler (secret header + chat allowlist).
     *
     * @return array<string, mixed>
     */
    public function handleWebhook(Request $r): array
    {
        if (!self::enabled($this->app)) {
            return ['ok' => false, 'error' => 'disabled'];
        }
        if (!self::configured($this->app)) {
            return ['ok' => false, 'error' => 'misconfigured'];
        }

        $header = trim((string) ($r->header('X-Telegram-Bot-Api-Secret-Token') ?? ''));
        $expected = self::webhookSecret($this->app);
        if ($header === '' || !hash_equals($expected, $header)) {
            return ['ok' => false, 'error' => 'bad_secret'];
        }

        $update = json_decode($r->rawBody(), true);
        if (!is_array($update)) {
            return ['ok' => false, 'error' => 'bad_json'];
        }

        $cb = $update['callback_query'] ?? null;
        if (!is_array($cb)) {
            return ['ok' => true, 'ignored' => true];
        }

        $chatId = (string) ($cb['message']['chat']['id'] ?? $cb['from']['id'] ?? '');
        $allowed = self::chatId($this->app);
        if ($chatId === '' || !hash_equals($allowed, $chatId)) {
            $this->answerCallback((string) ($cb['id'] ?? ''), 'Чат не в allowlist');
            return ['ok' => false, 'error' => 'chat_denied'];
        }

        $data = (string) ($cb['data'] ?? '');
        $cbId = (string) ($cb['id'] ?? '');
        if (preg_match('/^dapp:([a-f0-9]{32})$/', $data, $m)) {
            try {
                $result = $this->approve($m[1], 'telegram');
                $this->answerCallback($cbId, 'Применено');
                return ['ok' => true, 'action' => 'approved', 'deploy_id' => $m[1], 'files_copied' => $result['files_copied'] ?? 0];
            } catch (\Throwable $e) {
                $this->answerCallback($cbId, mb_substr($e->getMessage(), 0, 180));
                return ['ok' => false, 'error' => $e->getMessage(), 'deploy_id' => $m[1]];
            }
        }
        if (preg_match('/^drej:([a-f0-9]{32})$/', $data, $m)) {
            try {
                $this->reject($m[1], 'telegram');
                $this->answerCallback($cbId, 'Отклонено');
                return ['ok' => true, 'action' => 'rejected', 'deploy_id' => $m[1]];
            } catch (\Throwable $e) {
                $this->answerCallback($cbId, mb_substr($e->getMessage(), 0, 180));
                return ['ok' => false, 'error' => $e->getMessage(), 'deploy_id' => $m[1]];
            }
        }

        $this->answerCallback($cbId, 'Неизвестная кнопка');
        return ['ok' => true, 'ignored' => true];
    }

    /** @return list<array<string, mixed>> */
    public function listPendingSummaries(): array
    {
        $this->expireStale();
        $out = [];
        foreach ($this->allMetaFiles() as $path) {
            $raw = @file_get_contents($path);
            $meta = is_string($raw) ? json_decode($raw, true) : null;
            if (!is_array($meta) || ($meta['status'] ?? '') !== 'pending') {
                continue;
            }
            $out[] = [
                'id' => (string) ($meta['id'] ?? ''),
                'package' => (string) ($meta['package'] ?? ''),
                'created_at' => (string) ($meta['created_at'] ?? ''),
                'expires_at' => (string) ($meta['expires_at'] ?? ''),
                'requested_by' => (string) ($meta['requested_by'] ?? ''),
                'sha256' => (string) ($meta['sha256'] ?? ''),
            ];
        }
        usort($out, static fn($a, $b) => strcmp((string) ($b['created_at'] ?? ''), (string) ($a['created_at'] ?? '')));
        return $out;
    }

    public function ensureWebhook(): void
    {
        $base = rtrim((string) ($this->app['url'] ?? $this->app['app_url'] ?? ''), '/');
        if ($base === '') {
            throw new \RuntimeException('APP_URL пуст — нельзя зарегистрировать Telegram webhook.');
        }
        $url = $base . '/api/v1/telegram/deploy-webhook';
        $this->telegramApi('setWebhook', [
            'url' => $url,
            'secret_token' => self::webhookSecret($this->app),
            'allowed_updates' => json_encode(['callback_query']),
            'drop_pending_updates' => false,
        ]);
    }

    /** @param array<string, mixed> $meta */
    private function notifyPending(array $meta): int
    {
        $text = "🔐 CMS update ждёт подтверждения\n"
            . '📦 ' . ($meta['package'] ?? '') . "\n"
            . 'via: ' . ($meta['requested_by'] ?? '') . "\n"
            . 'id: `' . ($meta['id'] ?? '') . "`\n"
            . 'expires: ' . ($meta['expires_at'] ?? '');

        $keyboard = [
            'inline_keyboard' => [[
                ['text' => '✅ Approve', 'callback_data' => 'dapp:' . $meta['id']],
                ['text' => '❌ Reject', 'callback_data' => 'drej:' . $meta['id']],
            ]],
        ];

        $json = $this->telegramApi('sendMessage', [
            'chat_id' => self::chatId($this->app),
            'text' => mb_substr($text, 0, 4000),
            'parse_mode' => 'Markdown',
            'disable_web_page_preview' => true,
            'reply_markup' => json_encode($keyboard, JSON_UNESCAPED_UNICODE),
        ]);

        return (int) ($json['result']['message_id'] ?? 0);
    }

    private function answerCallback(string $callbackId, string $text): void
    {
        if ($callbackId === '') {
            return;
        }
        try {
            $this->telegramApi('answerCallbackQuery', [
                'callback_query_id' => $callbackId,
                'text' => mb_substr($text, 0, 180),
                'show_alert' => false,
            ]);
        } catch (\Throwable) {
            // non-fatal
        }
    }

    private function editMessage(int $messageId, string $text): void
    {
        if ($messageId <= 0) {
            return;
        }
        try {
            $this->telegramApi('editMessageText', [
                'chat_id' => self::chatId($this->app),
                'message_id' => $messageId,
                'text' => mb_substr($text, 0, 4000),
                'parse_mode' => 'Markdown',
                'disable_web_page_preview' => true,
            ]);
        } catch (\Throwable) {
            // non-fatal
        }
    }

    /**
     * @param array<string, mixed> $params
     * @return array<string, mixed>
     */
    private function telegramApi(string $method, array $params): array
    {
        $token = self::botToken($this->app);
        $url = 'https://api.telegram.org/bot' . rawurlencode($token) . '/' . $method;
        $payload = http_build_query($params);
        $body = null;
        $err = null;
        if (function_exists('curl_init')) {
            $ch = curl_init($url);
            curl_setopt_array($ch, [
                CURLOPT_POST => true,
                CURLOPT_POSTFIELDS => $payload,
                CURLOPT_RETURNTRANSFER => true,
                CURLOPT_TIMEOUT => 20,
                CURLOPT_HTTPHEADER => ['Content-Type: application/x-www-form-urlencoded'],
            ]);
            $body = curl_exec($ch);
            if ($body === false) {
                $err = curl_error($ch);
            }
            curl_close($ch);
        } else {
            $ctx = stream_context_create([
                'http' => [
                    'method' => 'POST',
                    'header' => "Content-Type: application/x-www-form-urlencoded\r\n",
                    'content' => $payload,
                    'timeout' => 20,
                    'ignore_errors' => true,
                ],
            ]);
            $body = @file_get_contents($url, false, $ctx);
            if ($body === false) {
                $err = 'file_get_contents failed';
            }
        }
        if ($err !== null) {
            throw new \RuntimeException('Telegram request failed: ' . $err);
        }
        $json = json_decode((string) $body, true);
        if (!is_array($json) || empty($json['ok'])) {
            $desc = is_array($json) ? (string) ($json['description'] ?? 'unknown') : 'invalid response';
            throw new \RuntimeException('Telegram API error: ' . $desc);
        }
        return $json;
    }

    private function ensurePendingDir(): void
    {
        if (!is_dir($this->pendingDir) && !@mkdir($this->pendingDir, 0750, true) && !is_dir($this->pendingDir)) {
            throw new \RuntimeException('Не удалось создать storage/updates/pending.');
        }
        $ht = dirname($this->pendingDir) . '/.htaccess';
        if (!is_file($ht)) {
            @file_put_contents($ht, "Require all denied\nOptions -Indexes\n");
        }
        $deny = $this->pendingDir . '/.htaccess';
        if (!is_file($deny)) {
            @file_put_contents($deny, "Require all denied\nOptions -Indexes\n");
        }
    }

    private function zipPath(string $id): string
    {
        return $this->pendingDir . DIRECTORY_SEPARATOR . $id . '.zip';
    }

    private function metaPath(string $id): string
    {
        return $this->pendingDir . DIRECTORY_SEPARATOR . $id . '.json';
    }

    /** @param array<string, mixed> $meta */
    private function writeMeta(string $id, array $meta): void
    {
        $this->ensurePendingDir();
        $json = json_encode($meta, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
        if ($json === false || @file_put_contents($this->metaPath($id), $json, LOCK_EX) === false) {
            throw new \RuntimeException('Не удалось записать pending meta.');
        }
    }

    /** @return array<string, mixed>|null */
    private function loadMeta(string $id): ?array
    {
        if (!preg_match('/^[a-f0-9]{32}$/', $id)) {
            return null;
        }
        $path = $this->metaPath($id);
        if (!is_file($path)) {
            return null;
        }
        $raw = @file_get_contents($path);
        $meta = is_string($raw) ? json_decode($raw, true) : null;
        return is_array($meta) ? $meta : null;
    }

    private function markStatus(string $id, string $status): void
    {
        $meta = $this->loadMeta($id);
        if ($meta === null) {
            return;
        }
        $meta['status'] = $status;
        $this->writeMeta($id, $meta);
    }

    /** @param array<string, mixed> $meta */
    private function isExpired(array $meta): bool
    {
        $exp = strtotime((string) ($meta['expires_at'] ?? ''));
        return $exp !== false && $exp < time();
    }

    private function expireStale(): void
    {
        foreach ($this->allMetaFiles() as $path) {
            $raw = @file_get_contents($path);
            $meta = is_string($raw) ? json_decode($raw, true) : null;
            if (!is_array($meta) || ($meta['status'] ?? '') !== 'pending') {
                continue;
            }
            if (!$this->isExpired($meta)) {
                continue;
            }
            $id = (string) ($meta['id'] ?? '');
            if ($id === '') {
                continue;
            }
            @unlink($this->zipPath($id));
            $meta['status'] = 'expired';
            $this->writeMeta($id, $meta);
        }
    }

    /** @return list<string> */
    private function allMetaFiles(): array
    {
        if (!is_dir($this->pendingDir)) {
            return [];
        }
        $files = glob($this->pendingDir . DIRECTORY_SEPARATOR . '*.json') ?: [];
        return array_values(array_filter($files, 'is_file'));
    }

    private function uploadErrorMessage(int $err): string
    {
        return match ($err) {
            UPLOAD_ERR_INI_SIZE, UPLOAD_ERR_FORM_SIZE => 'ZIP превышает лимит upload_max_filesize / post_max_size.',
            UPLOAD_ERR_PARTIAL => 'ZIP загружен частично.',
            UPLOAD_ERR_NO_FILE => 'Файл не получен.',
            default => 'Ошибка загрузки ZIP (код ' . $err . ').',
        };
    }
}
