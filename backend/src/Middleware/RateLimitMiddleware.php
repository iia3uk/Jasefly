<?php
declare(strict_types=1);

namespace App\Middleware;

use App\Database;
use App\Request;
use App\Response;

final class RateLimitMiddleware
{
    public function __construct(
        private Database $db,
        private int $maxAttempts = 20,
        private int $windowSeconds = 60
    ) {}

    public function __invoke(Request $r, callable $next): mixed
    {
        $ip = $r->ip();
        $endpoint = $r->method . ':' . $r->path;
        $windowStart = date('Y-m-d H:i:s', time() - $this->windowSeconds);

        $row = $this->db->one(
            'SELECT id, attempts, window_start FROM rate_limits WHERE ip_address=? AND endpoint=? AND window_start >= ? ORDER BY id DESC LIMIT 1',
            [$ip, $endpoint, $windowStart]
        );

        if ($row) {
            if ((int) $row['attempts'] >= $this->maxAttempts) {
                Response::error('Too many requests. Please try again later.', 429);
            }
            $this->db->run('UPDATE rate_limits SET attempts = attempts + 1 WHERE id=?', [$row['id']]);
        } else {
            $this->db->run(
                'INSERT INTO rate_limits(ip_address, endpoint, attempts, window_start) VALUES(?,?,1,NOW())',
                [$ip, $endpoint]
            );
        }

        return $next();
    }
}
