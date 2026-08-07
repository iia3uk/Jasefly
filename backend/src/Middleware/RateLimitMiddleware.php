<?php
declare(strict_types=1);

namespace App\Middleware;

use App\Database;
use App\Request;
use App\Response;

/**
 * Hard rate limit for auth/search/contact.
 * Default fail-open if rate_limits table is missing (shared hosting schema lag).
 * Login/auth paths should pass $failClosed=true so DB lag cannot disable throttle.
 */
final class RateLimitMiddleware
{
    public function __construct(
        private Database $db,
        private int $maxAttempts = 20,
        private int $windowSeconds = 60,
        private bool $failClosed = false,
    ) {}

    public function __invoke(Request $r, callable $next): mixed
    {
        // Dual-runtime parity harness hammers /auth/login with bad credentials.
        if (getenv('BEHAVIOR_PARITY') === '1' || getenv('APP_ENV') === 'test') {
            return $next();
        }
        if ($this->isLimited($r)) {
            Response::error('Too many requests. Please try again later.', 429);
        }

        return $next();
    }

    /**
     * Record an attempt and return true when the caller must be rejected (429).
     * Public for tests — does not exit.
     */
    public function isLimited(Request $r): bool
    {
        $ip = $r->ip();
        $endpoint = $r->method . ':' . $r->path;

        try {
            return $this->hitDatabase($ip, $endpoint);
        } catch (\Throwable $e) {
            @error_log('RateLimitMiddleware DB fail: ' . $e->getMessage());
            if ($this->failClosed) {
                return $this->hitFileFallback($ip, $endpoint);
            }
            return false;
        }
    }

    private function hitDatabase(string $ip, string $endpoint): bool
    {
        $windowStart = date('Y-m-d H:i:s', time() - $this->windowSeconds);
        $nowSql = $this->db->driver() === 'sqlite' ? "datetime('now')" : 'NOW()';

        $row = $this->db->one(
            'SELECT id, attempts, window_start FROM rate_limits WHERE ip_address=? AND endpoint=? AND window_start >= ? ORDER BY id DESC LIMIT 1',
            [$ip, $endpoint, $windowStart]
        );

        if ($row) {
            if ((int) $row['attempts'] >= $this->maxAttempts) {
                return true;
            }
            $this->db->run('UPDATE rate_limits SET attempts = attempts + 1 WHERE id=?', [$row['id']]);
            return false;
        }

        $this->db->run(
            "INSERT INTO rate_limits(ip_address, endpoint, attempts, window_start) VALUES(?,?,1,{$nowSql})",
            [$ip, $endpoint]
        );
        return false;
    }

    /** File fallback when DB unavailable and fail-closed is requested (login). */
    private function hitFileFallback(string $ip, string $endpoint): bool
    {
        $dir = $this->fallbackDir();
        if ($dir === null) {
            // Cannot persist counters — fail closed for auth.
            return true;
        }
        $key = hash('sha256', $ip . '|' . $endpoint);
        $file = $dir . '/' . $key . '.json';
        $now = time();
        $data = ['window_start' => $now, 'attempts' => 0];
        if (is_file($file)) {
            $raw = @file_get_contents($file);
            $decoded = is_string($raw) ? json_decode($raw, true) : null;
            if (is_array($decoded)
                && isset($decoded['window_start'], $decoded['attempts'])
                && ($now - (int) $decoded['window_start']) < $this->windowSeconds
            ) {
                $data = [
                    'window_start' => (int) $decoded['window_start'],
                    'attempts' => (int) $decoded['attempts'],
                ];
            }
        }
        if ($data['attempts'] >= $this->maxAttempts) {
            return true;
        }
        $data['attempts']++;
        @file_put_contents($file, json_encode($data), LOCK_EX);
        return false;
    }

    private function fallbackDir(): ?string
    {
        try {
            $base = dirname(__DIR__, 2) . '/storage/rate_limits';
            if (!is_dir($base) && !@mkdir($base, 0755, true) && !is_dir($base)) {
                return null;
            }
            return $base;
        } catch (\Throwable) {
            return null;
        }
    }
}
