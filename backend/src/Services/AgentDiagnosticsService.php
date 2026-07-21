<?php
declare(strict_types=1);

namespace App\Services;

use App\Database;
use App\Request;
use App\Response;

/**
 * Diagnostics payload for the Cursor MCP agent only (mcp_api_token).
 * Regular admin JWT cannot call these endpoints.
 */
final class AgentDiagnosticsService
{
    public function __construct(private Database $db, private array $app) {}

    public static function requireMcpAgent(Request $r): void
    {
        if (($r->user['auth'] ?? '') !== 'mcp_token') {
            Response::error('Доступно только MCP-агенту (Authorization: Bearer mcp_api_token)', 403);
        }
    }

    /** @return array<string, mixed> */
    public function snapshot(): array
    {
        $storage = (string) ($this->app['storage'] ?? (dirname(__DIR__, 2) . '/storage'));
        $logsDir = $storage . '/logs';
        $lastError = ErrorReportService::last();
        $lastUpdate = $this->readJson($storage . '/updates/last-result.json');
        $migrations = $this->migrationBrief();
        $health = (new SystemHealthService($this->db, $this->app))->status();
        $logTails = $this->logTails($logsDir);

        $broken = false;
        $hints = [];

        if ($lastError) {
            $broken = true;
            $hints[] = 'Есть last-error.json — смотри last_error.message / file / line.';
        }
        if (!empty($migrations['blocked']) || !empty($migrations['error']) || !empty($migrations['pending'])) {
            $broken = true;
            $hints[] = 'Миграции: pending или ошибка — см. migrations.';
        }
        if (is_array($lastUpdate) && isset($lastUpdate['ok']) && $lastUpdate['ok'] === false) {
            $broken = true;
            $hints[] = 'Последний in-panel update упал — см. last_update.';
        }

        if ($hints === []) {
            $hints[] = 'Явных поломок в логах не видно. Если сайт всё равно лежит — проверь HTTP/hosting PHP error log.';
        }

        $this->touchAgentPoll($logsDir);

        return [
            'for_agent' => true,
            'at' => gmdate('c'),
            'broken' => $broken,
            'summary' => $broken
                ? 'Сайт сообщает о проблемах — разбери поля ниже и почини до следующего деплоя.'
                : 'Критических записей нет.',
            'hints' => $hints,
            'last_error' => $lastError,
            'last_update' => $lastUpdate,
            'migrations' => $migrations,
            'health' => $health,
            'logs' => $logTails,
            'app_version' => (string) ($this->app['version'] ?? $health['app_version'] ?? ''),
        ];
    }

    /** @return array<string, mixed> */
    private function migrationBrief(): array
    {
        try {
            $root = dirname(__DIR__, 2);
            $svc = new MigrationService(
                $this->db,
                $root . '/migrations',
                (string) ($this->app['storage'] ?? ($root . '/storage')),
                $root . '/src/Modules'
            );
            // Do not auto-apply here — diagnostics only
            $status = $svc->status(false);
            return [
                'ok' => $status['ok'] ?? null,
                'pending' => $status['pending'] ?? [],
                'blocked' => $status['blocked'] ?? false,
                'error' => $status['error'] ?? null,
                'applied_count' => is_array($status['applied'] ?? null) ? count($status['applied']) : null,
            ];
        } catch (\Throwable $e) {
            return ['ok' => false, 'error' => $e->getMessage()];
        }
    }

    /**
     * @return array<string, mixed>
     */
    private function logTails(string $logsDir): array
    {
        $out = [];
        if (!is_dir($logsDir)) {
            return $out;
        }
        $allow = ['mail.log', 'app.log', 'php-error.log', 'error.log', 'mcp-access.jsonl'];
        foreach ($allow as $name) {
            $path = $logsDir . '/' . $name;
            if (!is_file($path)) {
                continue;
            }
            $out[$name] = [
                'bytes' => filesize($path) ?: 0,
                'mtime' => gmdate('c', (int) filemtime($path)),
                'tail' => $this->tailFile($path, 80),
            ];
        }
        // Any extra *.log (capped)
        $extra = 0;
        foreach (glob($logsDir . '/*.log') ?: [] as $path) {
            $base = basename($path);
            if (isset($out[$base])) {
                continue;
            }
            if ($extra >= 5) {
                break;
            }
            $out[$base] = [
                'bytes' => filesize($path) ?: 0,
                'mtime' => gmdate('c', (int) filemtime($path)),
                'tail' => $this->tailFile($path, 40),
            ];
            $extra++;
        }
        return $out;
    }

    private function tailFile(string $path, int $maxLines): string
    {
        $size = filesize($path);
        if ($size === false || $size === 0) {
            return '';
        }
        $fh = @fopen($path, 'rb');
        if ($fh === false) {
            return '';
        }
        $read = (int) min($size, 64 * 1024);
        fseek($fh, -$read, SEEK_END);
        $chunk = stream_get_contents($fh) ?: '';
        fclose($fh);
        $lines = preg_split("/\r\n|\n|\r/", $chunk) ?: [];
        if (count($lines) > $maxLines) {
            $lines = array_slice($lines, -$maxLines);
        }
        return implode("\n", $lines);
    }

    /** @return array<string, mixed>|null */
    private function readJson(string $path): ?array
    {
        if (!is_file($path)) {
            return null;
        }
        $raw = @file_get_contents($path);
        if ($raw === false || $raw === '') {
            return null;
        }
        $decoded = json_decode($raw, true);
        return is_array($decoded) ? $decoded : null;
    }

    private function touchAgentPoll(string $logsDir): void
    {
        if (!is_dir($logsDir)) {
            @mkdir($logsDir, 0755, true);
        }
        $line = json_encode([
            'at' => gmdate('c'),
            'event' => 'diagnostics_poll',
        ], JSON_UNESCAPED_UNICODE) . "\n";
        @file_put_contents($logsDir . '/mcp-access.jsonl', $line, FILE_APPEND | LOCK_EX);
    }
}
