<?php
declare(strict_types=1);

namespace App\Middleware;

use App\Database;
use App\Request;
use App\Response;

/**
 * Like RateLimitMiddleware, but returns HTTP 200 + throttled flag
 * so background workers / translate overlay stay quiet in the browser console.
 */
final class SoftRateLimitMiddleware
{
    /**
     * @param array<string, mixed> $throttleData Extra fields under data when limited
     */
    public function __construct(
        private Database $db,
        private int $maxAttempts = 20,
        private int $windowSeconds = 60,
        private array $throttleData = [],
    ) {}

    public function __invoke(Request $r, callable $next): mixed
    {
        $ip = $r->ip();
        $endpoint = 'soft:' . $r->method . ':' . $r->path;
        $windowStart = date('Y-m-d H:i:s', time() - $this->windowSeconds);

        try {
            $row = $this->db->one(
                'SELECT id, attempts, window_start FROM rate_limits WHERE ip_address=? AND endpoint=? AND window_start >= ? ORDER BY id DESC LIMIT 1',
                [$ip, $endpoint, $windowStart]
            );

            if ($row) {
                if ((int) $row['attempts'] >= $this->maxAttempts) {
                    $data = array_merge([
                        'throttled' => true,
                        'enabled' => true,
                        'finished' => false,
                        'ready' => false,
                        'translated' => 0,
                        'translations' => [],
                        'cached' => 0,
                        'fetched' => 0,
                        'missing' => 0,
                        'failed' => 0,
                    ], $this->throttleData);
                    $data['throttled'] = true;
                    Response::json(['data' => $data]);
                }
                $this->db->run('UPDATE rate_limits SET attempts = attempts + 1 WHERE id=?', [$row['id']]);
            } else {
                $now = $this->db->driver() === 'sqlite' ? "datetime('now')" : 'NOW()';
                $this->db->run(
                    "INSERT INTO rate_limits(ip_address, endpoint, attempts, window_start) VALUES(?,?,1,{$now})",
                    [$ip, $endpoint]
                );
            }
        } catch (\Throwable) {
            // fail-open
        }

        return $next();
    }
}
