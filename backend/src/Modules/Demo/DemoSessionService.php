<?php
declare(strict_types=1);

namespace App\Modules\Demo;

use App\Database;
use App\Jwt;
use App\Request;

final class DemoSessionService
{
    public const TTL_SECONDS = 7200;
    public const DEMO_USER_ID = -1;

    public function __construct(
        private Database $db,
        private array $app,
        private DemoOverlayStore $store,
        private DemoSeedService $seed,
        private string $storageRoot,
    ) {}

    /** @return array{session_id: string, access_token: string, expires_in: int, user: array<string, mixed>} */
    public function start(Request $r): array
    {
        $this->ensureTables();
        try {
            $this->cleanupExpired();
        } catch (\Throwable) {
        }
        $sid = bin2hex(random_bytes(16));
        $ttl = self::TTL_SECONDS;
        $token = $this->issueToken($sid, $ttl);
        $hash = hash('sha256', $token);
        $expires = date('Y-m-d H:i:s', time() + $ttl);
        $ua = substr((string) ($r->header('User-Agent') ?? ''), 0, 255);
        $this->db->run(
            'INSERT INTO demo_sessions(id, token_hash, expires_at, ip_address, user_agent, last_seen_at) VALUES(?,?,?,?,?,CURRENT_TIMESTAMP)',
            [$sid, $hash, $expires, $r->ip(), $ua]
        );
        $this->seed->applyToSession($sid);
        $this->audit($sid, 'start', 'auth/demo/start', ['ip' => $r->ip()]);
        DemoCookie::set($token, $ttl);

        return [
            'session_id' => $sid,
            'access_token' => $token,
            'expires_in' => $ttl,
            'is_demo' => true,
            'user' => $this->syntheticUser(),
            'capabilities' => DemoCapabilityPolicy::allowedCapabilities(),
            'home_page_id' => 900001,
            'admin_entry' => '/demo',
        ];
    }

    public function reset(string $sessionId): void
    {
        $this->assertActive($sessionId);
        $this->seed->applyToSession($sessionId);
        $this->purgeStorage($sessionId);
        $this->audit($sessionId, 'reset', 'auth/demo/reset', []);
    }

    public function end(string $sessionId): void
    {
        $this->store->deleteSession($sessionId);
        $this->db->run('DELETE FROM demo_sessions WHERE id=?', [$sessionId]);
        $this->purgeStorage($sessionId);
        DemoCookie::clear();
        $this->audit($sessionId, 'end', 'auth/demo/end', []);
    }

    public function resolveFromRequest(Request $r): ?DemoContext
    {
        $bearer = $r->bearer() ?: DemoCookie::token();
        if (!$bearer) {
            return null;
        }
        try {
            $payload = Jwt::decode($bearer, (string) $this->app['jwt_secret']);
        } catch (\Throwable) {
            return null;
        }
        if (($payload['type'] ?? '') !== 'demo_access' || empty($payload['is_demo'])) {
            return null;
        }
        $sid = (string) ($payload['demo_sid'] ?? '');
        if ($sid === '') {
            return null;
        }
        $row = $this->db->one(
            'SELECT id, expires_at FROM demo_sessions WHERE id=? AND token_hash=? AND expires_at > CURRENT_TIMESTAMP',
            [$sid, hash('sha256', $bearer)]
        );
        if (!$row) {
            return null;
        }
        try {
            $this->db->run('UPDATE demo_sessions SET last_seen_at=CURRENT_TIMESTAMP WHERE id=?', [$sid]);
        } catch (\Throwable) {
        }
        $exp = strtotime((string) $row['expires_at']) ?: null;
        return new DemoContext($sid, self::DEMO_USER_ID, true, 'demo', $exp, true);
    }

    public function assertActive(string $sessionId): void
    {
        $row = $this->db->one(
            'SELECT id FROM demo_sessions WHERE id=? AND expires_at > CURRENT_TIMESTAMP',
            [$sessionId]
        );
        if (!$row) {
            throw new \RuntimeException('Demo session expired');
        }
    }

    public function cleanupExpired(): int
    {
        $this->ensureTables();
        $rows = $this->db->all('SELECT id FROM demo_sessions WHERE expires_at <= CURRENT_TIMESTAMP');
        $n = 0;
        foreach ($rows as $row) {
            $sid = (string) $row['id'];
            $this->store->deleteSession($sid);
            $this->purgeStorage($sid);
            $this->db->run('DELETE FROM demo_sessions WHERE id=?', [$sid]);
            $n++;
        }
        return $n;
    }

    /** @return array<string, mixed> */
    public function syntheticUser(): array
    {
        return [
            'id' => self::DEMO_USER_ID,
            'email' => 'demo@jasefly.local',
            'name' => 'Demo Explorer',
            'role' => 'demo_explorer',
            'roles' => ['demo_explorer'],
            'is_super' => false,
            'is_demo' => true,
            'totp_enabled' => false,
            'capabilities' => DemoCapabilityPolicy::allowedCapabilities(),
            'caps_version' => 'demo-1',
        ];
    }

    private function issueToken(string $sessionId, int $ttl): string
    {
        return Jwt::encode([
            'sub' => self::DEMO_USER_ID,
            'name' => 'Demo Explorer',
            'email' => 'demo@jasefly.local',
            'role' => 'demo_explorer',
            'type' => 'demo_access',
            'is_demo' => true,
            'demo_sid' => $sessionId,
            'exp' => time() + $ttl,
        ], (string) $this->app['jwt_secret']);
    }

    private function purgeStorage(string $sessionId): void
    {
        $dir = rtrim($this->storageRoot, '/\\') . DIRECTORY_SEPARATOR . 'demo' . DIRECTORY_SEPARATOR . $sessionId;
        if (!is_dir($dir)) {
            return;
        }
        $it = new \RecursiveIteratorIterator(
            new \RecursiveDirectoryIterator($dir, \FilesystemIterator::SKIP_DOTS),
            \RecursiveIteratorIterator::CHILD_FIRST
        );
        foreach ($it as $file) {
            $file->isDir() ? @rmdir($file->getPathname()) : @unlink($file->getPathname());
        }
        @rmdir($dir);
    }

    /** @param array<string, mixed> $detail */
    public function audit(string $sessionId, string $action, string $path, array $detail): void
    {
        try {
            $safe = DemoResponseSanitizer::sanitize($detail);
            $this->db->run(
                'INSERT INTO demo_audit_log(session_id, action, path, detail_json) VALUES(?,?,?,?)',
                [$sessionId, $action, substr($path, 0, 255), json_encode($safe, JSON_UNESCAPED_UNICODE)]
            );
        } catch (\Throwable) {
        }
    }

    public function ensureTables(): void
    {
        // Fail soft if migration not applied yet — start will surface DB errors.
        $this->db->one('SELECT 1 FROM demo_sessions LIMIT 1');
    }
}
