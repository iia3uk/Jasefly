<?php
declare(strict_types=1);

namespace App\Modules\Overload;

use App\Database;
use App\Platform\Adapters\MailAdapter;
use App\Response;

/**
 * Load-average monitor: sample → log / notify / 503 shed.
 * Fail-open when sys_getloadavg() is unavailable (Windows, restricted hosts).
 *
 * On shared hosting load is host-wide — compare against per-CPU thresholds by default
 * so neighbor traffic / MCP ZIP unpack does not look like "your" overload.
 */
final class OverloadService
{
    /** @param array<string, mixed> $settings */
    public function __construct(
        private Database $db,
        private array $settings,
        private string $storage,
        private array $app = [],
    ) {}

    /** @return array<string, mixed> */
    public static function defaultSettings(): array
    {
        return [
            // Per-core units when normalize_by_cpu=true (default). Absolute when false.
            'threshold_1m' => 2.5,
            'threshold_5m' => 0,
            'normalize_by_cpu' => true,
            // 1m spike alone is not enough — 5m must also be elevated (MCP unzip is short).
            'require_sustained' => true,
            'mode' => 'log', // log | notify | block | block_notify
            'retry_after' => 30,
            'error_message' => 'Сайт временно недоступен из‑за высокой нагрузки на сервер. Попробуйте позже.',
            'notify_emails' => '',
            'notify_cooldown_min' => 15,
            'sample_ttl_sec' => 5,
            'admin_bypass' => true,
            'event_cooldown_sec' => 300,
            // Suppress trips after SiteUpdater / MCP release (seconds).
            'quiet_after_update_sec' => 600,
        ];
    }

    /** @return array<string, mixed> */
    public function settings(): array
    {
        return $this->settings;
    }

    public function adminBypass(): bool
    {
        return (bool) ($this->settings['admin_bypass'] ?? true);
    }

    public static function cpuCount(): int
    {
        if (is_file('/proc/cpuinfo')) {
            $raw = @file_get_contents('/proc/cpuinfo');
            if (is_string($raw)) {
                $n = preg_match_all('/^processor\s*:/m', $raw);
                if ($n > 0) {
                    return $n;
                }
            }
        }
        if (function_exists('shell_exec')) {
            $out = @shell_exec('nproc 2>/dev/null');
            $n = (int) trim((string) $out);
            if ($n > 0) {
                return $n;
            }
        }
        return 1;
    }

    public function normalizeByCpu(): bool
    {
        return (bool) ($this->settings['normalize_by_cpu'] ?? true);
    }

    public function requireSustained(): bool
    {
        return (bool) ($this->settings['require_sustained'] ?? true);
    }

    /** Absolute 1m threshold used for comparison against raw sys_getloadavg. */
    public function absoluteThreshold1m(): float
    {
        $t = (float) ($this->settings['threshold_1m'] ?? 2.5);
        if ($t <= 0) {
            return 0.0;
        }
        return $this->normalizeByCpu() ? $t * max(1, self::cpuCount()) : $t;
    }

    /** Absolute 5m threshold (0 = disabled unless require_sustained synthesizes one). */
    public function absoluteThreshold5m(): float
    {
        $t = (float) ($this->settings['threshold_5m'] ?? 0);
        if ($t > 0) {
            return $this->normalizeByCpu() ? $t * max(1, self::cpuCount()) : $t;
        }
        return 0.0;
    }

    /** Mark a quiet window after MCP / panel update so unpack spikes are not logged. */
    public static function markDeployQuiet(string $storage, int $seconds = 600): void
    {
        $seconds = max(60, $seconds);
        $dir = rtrim($storage, '/\\') . '/overload';
        if (!is_dir($dir)) {
            @mkdir($dir, 0755, true);
        }
        @file_put_contents($dir . '/quiet_until', (string) (time() + $seconds));
    }

    public function quietUntil(): int
    {
        $file = $this->stateDir() . '/quiet_until';
        if (!is_file($file)) {
            return 0;
        }
        return max(0, (int) @file_get_contents($file));
    }

    public function inQuietWindow(): bool
    {
        return $this->quietUntil() > time();
    }

    /** @return array{1: float, 5: float, 15: float}|null */
    public function sampleLoad(): ?array
    {
        $ttl = max(1, (int) ($this->settings['sample_ttl_sec'] ?? 5));
        $cacheFile = $this->stateDir() . '/sample.json';
        if (is_file($cacheFile)) {
            $raw = @file_get_contents($cacheFile);
            $cached = is_string($raw) ? json_decode($raw, true) : null;
            if (is_array($cached)
                && isset($cached['at'], $cached['1'], $cached['5'], $cached['15'])
                && (time() - (int) $cached['at']) < $ttl) {
                return [
                    1 => (float) $cached['1'],
                    5 => (float) $cached['5'],
                    15 => (float) $cached['15'],
                ];
            }
        }

        if (!function_exists('sys_getloadavg')) {
            return null;
        }
        $avg = @sys_getloadavg();
        if (!is_array($avg) || count($avg) < 3) {
            return null;
        }
        $sample = [
            1 => round((float) $avg[0], 2),
            5 => round((float) $avg[1], 2),
            15 => round((float) $avg[2], 2),
        ];
        @file_put_contents($cacheFile, json_encode([
            'at' => time(),
            '1' => $sample[1],
            '5' => $sample[5],
            '15' => $sample[15],
        ], JSON_UNESCAPED_UNICODE));

        return $sample;
    }

    public function isOverloaded(?array $sample = null): bool
    {
        $sample ??= $this->sampleLoad();
        return self::sampleExceeds(
            $sample,
            $this->absoluteThreshold1m(),
            $this->absoluteThreshold5m(),
            $this->requireSustained(),
        );
    }

    /**
     * @param array{1: float, 5: float, 15: float}|null $sample
     * Thresholds are absolute (already scaled by CPU if configured).
     */
    public static function sampleExceeds(
        ?array $sample,
        float $threshold1m,
        float $threshold5m = 0.0,
        bool $requireSustained = false,
    ): bool {
        if ($sample === null) {
            return false;
        }
        $hit1 = $threshold1m > 0 && $sample[1] >= $threshold1m;
        $t5 = $threshold5m;
        if ($t5 <= 0 && $requireSustained && $threshold1m > 0) {
            $t5 = $threshold1m * 0.75;
        }
        $hit5 = $t5 > 0 && $sample[5] >= $t5;

        if ($requireSustained) {
            // Short 1m spikes (ZIP unpack) must not trip without elevated 5m.
            return $hit1 && $hit5;
        }
        return $hit1 || ($threshold5m > 0 && $hit5);
    }

    public function mode(): string
    {
        $mode = (string) ($this->settings['mode'] ?? 'block_notify');
        return in_array($mode, ['log', 'notify', 'block', 'block_notify'], true) ? $mode : 'block_notify';
    }

    public function shouldCloseSite(): bool
    {
        $mode = $this->mode();
        return $mode === 'block' || $mode === 'block_notify';
    }

    public function shouldNotify(): bool
    {
        $mode = $this->mode();
        return $mode === 'notify' || $mode === 'block_notify';
    }

    /**
     * Evaluate load; record/notify as needed. Returns true when public traffic must be shed.
     */
    public function evaluateAndMaybeAct(): bool
    {
        if ($this->inQuietWindow()) {
            return false;
        }

        $sample = $this->sampleLoad();
        if ($sample === null || !$this->isOverloaded($sample)) {
            $this->writeState(['tripped' => false, 'last_ok_at' => time()]);
            return false;
        }

        $mode = $this->mode();
        $state = $this->readState();
        $eventCooldown = max(30, (int) ($this->settings['event_cooldown_sec'] ?? 300));
        $lastEvent = (int) ($state['last_event_at'] ?? 0);
        $record = $lastEvent === 0 || (time() - $lastEvent) >= $eventCooldown;

        $notified = false;
        if ($this->shouldNotify() && $this->canNotify($state)) {
            $notified = $this->sendOverloadEmails($sample);
            $state['last_notify_at'] = time();
        }

        if ($record) {
            $this->recordEvent($sample, $mode, $this->shouldCloseSite(), $notified);
            $state['last_event_at'] = time();
        }

        $state['tripped'] = true;
        $state['last_trip_at'] = time();
        $state['last_load'] = $sample;
        $this->writeState($state);

        return $this->shouldCloseSite();
    }

    /** Document-root HTML entry after Bootstrap::init — may exit with 503. */
    public static function enforceDocumentRoot(Database $db, array $app): void
    {
        if (!self::pluginEnabled($db)) {
            return;
        }
        $reqPath = parse_url((string) ($_SERVER['REQUEST_URI'] ?? ''), PHP_URL_PATH);
        if (is_string($reqPath) && \App\Support\PlatformFingerprint::isWellKnownPath($reqPath)) {
            return;
        }
        $settings = self::loadSettings($db);
        $storage = (string) ($app['storage'] ?? dirname(__DIR__, 3) . '/storage');
        $svc = new self($db, $settings, $storage, $app);
        if (!$svc->evaluateAndMaybeAct()) {
            return;
        }
        $svc->serveUnavailable(preferHtml: true);
    }

    public function serveUnavailable(bool $preferHtml = false): never
    {
        $retry = max(5, (int) ($this->settings['retry_after'] ?? 30));
        $message = trim((string) ($this->settings['error_message'] ?? ''));
        if ($message === '') {
            $message = 'Service temporarily unavailable due to high server load.';
        }

        http_response_code(503);
        header('Retry-After: ' . $retry);
        header('Cache-Control: no-store');
        header('X-Jasefly-Overload: 1');

        $accept = (string) ($_SERVER['HTTP_ACCEPT'] ?? '');
        $wantsJson = str_contains($accept, 'application/json')
            || str_contains((string) ($_SERVER['HTTP_X_REQUESTED_WITH'] ?? ''), 'XMLHttpRequest');

        if (!$preferHtml && $wantsJson) {
            Response::error($message, 503, ['reason' => 'overload'], ['retry_after' => $retry]);
        }

        header('Content-Type: text/html; charset=utf-8');
        $safe = htmlspecialchars($message, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
        echo '<!doctype html><html lang="ru"><head><meta charset="utf-8">'
            . '<meta name="viewport" content="width=device-width,initial-scale=1">'
            . '<title>503 Service Unavailable</title>'
            . '<style>body{margin:0;min-height:100vh;display:grid;place-items:center;'
            . 'font-family:ui-sans-serif,system-ui,sans-serif;background:#0a0e14;color:#e8edf5}'
            . '.box{max-width:32rem;padding:2rem;text-align:center}'
            . 'h1{font-size:1.25rem;margin:0 0 .75rem}p{margin:0;color:#9aa6b8;line-height:1.5}'
            . '.code{margin-top:1.25rem;font-size:.75rem;color:#5b6578}</style></head><body>'
            . '<div class="box"><h1>Сервис временно недоступен</h1>'
            . '<p>' . $safe . '</p>'
            . '<p class="code">503 Service Unavailable</p></div></body></html>';
        exit;
    }

    /** @return array<string, mixed> */
    public function publicStatus(): array
    {
        $sample = $this->sampleLoad();
        $state = $this->readState();
        $cpus = self::cpuCount();
        $abs1 = $this->absoluteThreshold1m();
        $abs5 = $this->absoluteThreshold5m();
        $events = [];
        try {
            $events = $this->db->all(
                'SELECT id, load_1, load_5, load_15, threshold, mode, closed_site, notified, note, created_at
                 FROM overload_events ORDER BY id DESC LIMIT 25'
            );
        } catch (\Throwable) {
        }

        $stats = ['total' => 0, 'last_24h' => 0, 'closed_24h' => 0];
        try {
            $stats['total'] = (int) ($this->db->one('SELECT COUNT(*) c FROM overload_events')['c'] ?? 0);
            $stats['last_24h'] = (int) ($this->db->one(
                "SELECT COUNT(*) c FROM overload_events WHERE created_at >= DATE_SUB(NOW(), INTERVAL 1 DAY)"
            )['c'] ?? 0);
            $stats['closed_24h'] = (int) ($this->db->one(
                "SELECT COUNT(*) c FROM overload_events WHERE closed_site=1 AND created_at >= DATE_SUB(NOW(), INTERVAL 1 DAY)"
            )['c'] ?? 0);
        } catch (\Throwable) {
        }

        $perCore = null;
        if ($sample !== null && $cpus > 0) {
            $perCore = [
                1 => round($sample[1] / $cpus, 2),
                5 => round($sample[5] / $cpus, 2),
                15 => round($sample[15] / $cpus, 2),
            ];
        }

        $quietUntil = $this->quietUntil();

        return [
            'available' => $sample !== null,
            'platform' => PHP_OS_FAMILY,
            'cpus' => $cpus,
            'normalize_by_cpu' => $this->normalizeByCpu(),
            'require_sustained' => $this->requireSustained(),
            'load' => $sample,
            'load_per_core' => $perCore,
            'threshold_1m' => (float) ($this->settings['threshold_1m'] ?? 2.5),
            'threshold_5m' => (float) ($this->settings['threshold_5m'] ?? 0),
            'threshold_1m_absolute' => $abs1,
            'threshold_5m_absolute' => $abs5 > 0 ? $abs5 : ($this->requireSustained() ? round($abs1 * 0.75, 2) : 0),
            'mode' => $this->mode(),
            'overloaded' => $sample !== null && !$this->inQuietWindow() && $this->isOverloaded($sample),
            'quiet_until' => $quietUntil > time() ? $quietUntil : null,
            'tripped' => (bool) ($state['tripped'] ?? false),
            'last_trip_at' => $state['last_trip_at'] ?? null,
            'last_notify_at' => $state['last_notify_at'] ?? null,
            'retry_after' => (int) ($this->settings['retry_after'] ?? 30),
            'error_message' => (string) ($this->settings['error_message'] ?? ''),
            'stats' => $stats,
            'events' => $events,
            'hint' => 'sys_getloadavg на shared — нагрузка всего хоста (соседи + ваш аккаунт). '
                . 'Порог считается на ядро; краткие всплески при MCP/ZIP-апдейте глушатся окном тишины.',
        ];
    }

    public function sendTestNotify(): array
    {
        $sample = $this->sampleLoad() ?? [1 => 0.0, 5 => 0.0, 15 => 0.0];
        $ok = $this->sendOverloadEmails($sample, test: true);
        return ['sent' => $ok, 'recipients' => $this->notifyRecipients()];
    }

    /** @param array{1: float, 5: float, 15: float} $sample */
    private function recordEvent(array $sample, string $mode, bool $closed, bool $notified): void
    {
        try {
            $this->db->run(
                'INSERT INTO overload_events (load_1, load_5, load_15, threshold, mode, closed_site, notified, note)
                 VALUES (?,?,?,?,?,?,?,?)',
                [
                    $sample[1],
                    $sample[5],
                    $sample[15],
                    $this->absoluteThreshold1m(),
                    $mode,
                    $closed ? 1 : 0,
                    $notified ? 1 : 0,
                    $closed ? 'site_closed' : ($notified ? 'notified' : 'logged'),
                ]
            );
        } catch (\Throwable) {
            // Table may be missing before migrate.
        }
    }

    /** @param array{1: float, 5: float, 15: float} $sample */
    private function sendOverloadEmails(array $sample, bool $test = false): bool
    {
        $recipients = $this->notifyRecipients();
        $mail = new MailAdapter($this->db, $this->app !== [] ? $this->app : ['storage' => $this->storage]);
        if ($recipients === [] || !$mail->isAvailable()) {
            return false;
        }
        $host = (string) ($_SERVER['HTTP_HOST'] ?? ($this->app['url'] ?? 'site'));
        $cpus = self::cpuCount();
        $subject = ($test ? '[TEST] ' : '') . "Перегрузка сервера — {$host}";
        $body = "Зафиксирована высокая нагрузка на {$host}.\n\n"
            . "load 1m: {$sample[1]} (на ядро: " . round($sample[1] / max(1, $cpus), 2) . ")\n"
            . "load 5m: {$sample[5]}\n"
            . "load 15m: {$sample[15]}\n"
            . "CPU: {$cpus}\n"
            . 'Порог 1m (абс.): ' . (string) $this->absoluteThreshold1m() . "\n"
            . 'Режим: ' . $this->mode() . "\n"
            . 'Время: ' . gmdate('Y-m-d H:i:s') . " UTC\n";
        $html = '<pre style="font:14px/1.45 ui-monospace,monospace">'
            . htmlspecialchars($body, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8') . '</pre>';

        $result = $mail->sendHtml($recipients, $subject, $html, $body);
        return (bool) ($result['ok'] ?? false);
    }

    /** @return list<string> */
    private function notifyRecipients(): array
    {
        $raw = (string) ($this->settings['notify_emails'] ?? '');
        $parts = preg_split('/[\s,;]+/', $raw) ?: [];
        $out = [];
        foreach ($parts as $p) {
            $p = trim($p);
            if ($p !== '' && filter_var($p, FILTER_VALIDATE_EMAIL)) {
                $out[] = $p;
            }
        }
        if ($out === []) {
            $mail = $this->mailPluginSettings();
            foreach (['to_email', 'from_email'] as $key) {
                $e = trim((string) ($mail[$key] ?? ''));
                if ($e !== '' && filter_var($e, FILTER_VALIDATE_EMAIL)) {
                    $out[] = $e;
                    break;
                }
            }
        }
        return array_values(array_unique($out));
    }

    /** @return array<string, mixed> */
    private function mailPluginSettings(): array
    {
        try {
            $row = $this->db->one('SELECT settings FROM modules WHERE name=?', ['mail']);
            return $row ? (json_decode((string) ($row['settings'] ?? '{}'), true) ?: []) : [];
        } catch (\Throwable) {
            return [];
        }
    }

    /** @param array<string, mixed> $state */
    private function canNotify(array $state): bool
    {
        $cooldown = max(1, (int) ($this->settings['notify_cooldown_min'] ?? 15)) * 60;
        $last = (int) ($state['last_notify_at'] ?? 0);
        return $last === 0 || (time() - $last) >= $cooldown;
    }

    private function stateDir(): string
    {
        $dir = rtrim($this->storage, '/\\') . '/overload';
        if (!is_dir($dir)) {
            @mkdir($dir, 0755, true);
        }
        return $dir;
    }

    /** @return array<string, mixed> */
    private function readState(): array
    {
        $file = $this->stateDir() . '/state.json';
        if (!is_file($file)) {
            return [];
        }
        $raw = @file_get_contents($file);
        $data = is_string($raw) ? json_decode($raw, true) : null;
        return is_array($data) ? $data : [];
    }

    /** @param array<string, mixed> $state */
    private function writeState(array $state): void
    {
        @file_put_contents(
            $this->stateDir() . '/state.json',
            json_encode($state, JSON_UNESCAPED_UNICODE)
        );
    }

    public static function pluginEnabled(Database $db): bool
    {
        try {
            $row = $db->one('SELECT is_enabled FROM modules WHERE name=?', ['overload']);
            if (!$row) {
                return false; // no row → default off (enable in Plugins)
            }
            return (int) ($row['is_enabled'] ?? 0) === 1;
        } catch (\Throwable) {
            return false;
        }
    }

    /** @return array<string, mixed> */
    public static function loadSettings(Database $db): array
    {
        $defaults = self::defaultSettings();
        try {
            $row = $db->one('SELECT settings FROM modules WHERE name=?', ['overload']);
            $stored = $row ? (json_decode((string) ($row['settings'] ?? '{}'), true) ?: []) : [];
            return array_merge($defaults, is_array($stored) ? $stored : []);
        } catch (\Throwable) {
            return $defaults;
        }
    }
}
