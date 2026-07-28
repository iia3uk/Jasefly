<?php
declare(strict_types=1);

namespace App\Controllers;

use App\Core\Container;
use App\Core\ModuleRegistry;
use App\Database;
use App\Jwt;
use App\Request;
use App\Response;
use App\Services\ActivityLogService;
use App\Services\TotpService;
use App\Support\AuthCookie;
use App\Utils\Password;

final class AuthController
{
    public function __construct(private Database $db, private array $app) {}

    private function activity(): ActivityLogService
    {
        return new ActivityLogService($this->db);
    }

    private function totp(): TotpService
    {
        return new TotpService();
    }

    /** Ensure TOTP columns exist (migration 008); safe to call repeatedly. */
    private function ensureTotpColumns(): void
    {
        static $done = false;
        if ($done) {
            return;
        }
        $insp = $this->db->inspector();
        if (!$insp->columnExists('users', 'totp_secret')) {
            $this->db->run('ALTER TABLE users ADD COLUMN totp_secret VARCHAR(64) NULL');
        }
        if (!$insp->columnExists('users', 'totp_enabled')) {
            $this->db->run('ALTER TABLE users ADD COLUMN totp_enabled TINYINT(1) NOT NULL DEFAULT 0');
        }
        if (!$insp->columnExists('users', 'totp_confirmed_at')) {
            $this->db->run('ALTER TABLE users ADD COLUMN totp_confirmed_at DATETIME NULL');
        }
        $done = true;
    }

    private function token(array $user, int $ttl, string $type, array $extra = []): string
    {
        return Jwt::encode(array_merge([
            'sub' => (int) $user['id'],
            'email' => $user['email'],
            'name' => $user['name'],
            'role' => $user['role'] ?? 'admin',
            'type' => $type,
            'iat' => time(),
            'exp' => time() + $ttl,
            'jti' => bin2hex(random_bytes(12)),
        ], $extra), $this->app['jwt_secret']);
    }

    public function login(Request $r): never
    {
        $email = strtolower(trim((string) $r->input('email')));
        $password = (string) $r->input('password');
        $user = $this->db->one('SELECT * FROM users WHERE email=?', [$email]);
        if (!$user || !Password::verify($password, (string) $user['password_hash'])) {
            Response::error('Invalid credentials', 401);
        }

        // Upgrade legacy hashes to Argon2id on successful login.
        if (Password::needsRehash((string) $user['password_hash'])) {
            $this->db->run('UPDATE users SET password_hash=? WHERE id=?', [
                Password::hash($password),
                $user['id'],
            ]);
        }

        $blocked = $this->registrationLoginBlock($user);
        if ($blocked !== null) {
            Response::error($blocked, 403);
        }

        if (!empty($user['totp_enabled']) && !empty($user['totp_secret'])) {
            $challenge = $this->token($user, 300, '2fa_challenge');
            Response::json([
                'data' => [
                    'requires_2fa' => true,
                    'challenge_token' => $challenge,
                    'expires_in' => 300,
                ],
            ]);
        }

        $this->issueSession($r, $user);
    }

    /**
     * Выдать access/refresh токены (после регистрации / verify).
     *
     * @param array<string, mixed> $user
     * @param array<string, mixed> $extraPayload merged into JSON data
     */
    public function completeLogin(Request $r, array $user, array $extraPayload = []): never
    {
        $this->issueSession($r, $user, $extraPayload);
    }

    /** Complete login after TOTP code. */
    public function verify2fa(Request $r): never
    {
        $challenge = (string) $r->input('challenge_token');
        $code = (string) $r->input('code');
        try {
            $payload = Jwt::decode($challenge, $this->app['jwt_secret']);
            if (($payload['type'] ?? '') !== '2fa_challenge') {
                throw new \RuntimeException('bad type');
            }
            $user = $this->db->one('SELECT * FROM users WHERE id=?', [(int) ($payload['sub'] ?? 0)]);
            if (!$user || empty($user['totp_enabled']) || empty($user['totp_secret'])) {
                throw new \RuntimeException('2fa off');
            }
            if (!$this->totp()->verify((string) $user['totp_secret'], $code)) {
                Response::error('Invalid 2FA code', 401);
            }
            $this->issueSession($r, $user);
        } catch (\Throwable) {
            Response::error('Invalid or expired 2FA challenge', 401);
        }
    }

    /**
     * @param array<string, mixed> $user
     * @param array<string, mixed> $extraPayload
     */
    private function issueSession(Request $r, array $user, array $extraPayload = []): never
    {
        $this->db->run('UPDATE users SET last_login_at=NOW() WHERE id=?', [$user['id']]);
        $r->user = ['sub' => (int) $user['id'], 'name' => $user['name'], 'role' => $user['role']];
        $this->activity()->log($r, 'login', 'user', (int) $user['id'], $user['name']);

        $refresh = $this->token($user, $this->app['refresh_ttl'], 'refresh');
        $this->db->run(
            'INSERT INTO refresh_tokens(user_id, token_hash, expires_at) VALUES(?,?,DATE_ADD(NOW(), INTERVAL ? SECOND))',
            [$user['id'], hash('sha256', $refresh), $this->app['refresh_ttl']]
        );

        $access = $this->token($user, $this->app['jwt_ttl'], 'access');
        AuthCookie::set($access, (int) $this->app['jwt_ttl']);

        Response::json([
            'data' => array_merge([
                'requires_2fa' => false,
                'access_token' => $access,
                'refresh_token' => $refresh,
                'expires_in' => $this->app['jwt_ttl'],
                'user' => [
                    'id' => (int) $user['id'],
                    'email' => $user['email'],
                    'name' => $user['name'],
                    'role' => $user['role'],
                    'totp_enabled' => (bool) ($user['totp_enabled'] ?? false),
                ],
            ], $extraPayload),
        ]);
    }

    /** @param array<string, mixed> $user */
    private function registrationLoginBlock(array $user): ?string
    {
        try {
            $reg = Container::getInstance()->get(ModuleRegistry::class);
            foreach ($reg->all() as $module) {
                if ($module->name() !== 'registration') {
                    continue;
                }
                if (!$reg->state()->isEnabled($module)) {
                    return null;
                }
                $settings = $reg->state()->getSettings($module);
                $svc = new \App\Modules\Registration\RegistrationService($this->db, $this->app, $settings);
                return $svc->blockLoginUntilVerified($user);
            }
        } catch (\Throwable) {
        }
        return null;
    }

    public function refresh(Request $r): never
    {
        try {
            $token = (string) $r->input('refresh_token');
            $payload = Jwt::decode($token, $this->app['jwt_secret']);
            if (($payload['type'] ?? '') !== 'refresh') {
                throw new \RuntimeException('Invalid type');
            }
            $stored = $this->db->one(
                'SELECT * FROM refresh_tokens WHERE token_hash=? AND expires_at > NOW()',
                [hash('sha256', $token)]
            );
            if (!$stored) {
                throw new \RuntimeException('Token revoked');
            }
            $user = $this->db->one('SELECT * FROM users WHERE id=?', [$payload['sub']]);
            if (!$user) {
                throw new \RuntimeException('User missing');
            }
            // Rotate refresh token: revoke presented hash, issue a new refresh JWT.
            $this->db->run('DELETE FROM refresh_tokens WHERE token_hash=?', [hash('sha256', $token)]);
            $refresh = $this->token($user, $this->app['refresh_ttl'], 'refresh');
            $this->db->run(
                'INSERT INTO refresh_tokens(user_id, token_hash, expires_at) VALUES(?,?,DATE_ADD(NOW(), INTERVAL ? SECOND))',
                [$user['id'], hash('sha256', $refresh), $this->app['refresh_ttl']]
            );
            $access = $this->token($user, $this->app['jwt_ttl'], 'access');
            AuthCookie::set($access, (int) $this->app['jwt_ttl']);
            Response::json([
                'data' => [
                    'access_token' => $access,
                    'refresh_token' => $refresh,
                    'expires_in' => $this->app['jwt_ttl'],
                ],
            ]);
        } catch (\Throwable) {
            Response::error('Invalid refresh token', 401);
        }
    }

    public function logout(Request $r): never
    {
        $token = (string) ($r->input('refresh_token') ?? '');
        if ($token !== '') {
            $this->db->run('DELETE FROM refresh_tokens WHERE token_hash=?', [hash('sha256', $token)]);
        }
        // Optional activity log if still authenticated
        try {
            $bearer = $r->bearer() ?: AuthCookie::token();
            if ($bearer) {
                $payload = Jwt::decode($bearer, $this->app['jwt_secret']);
                if (($payload['type'] ?? '') === 'access') {
                    $r->user = [
                        'sub' => (int) ($payload['sub'] ?? 0),
                        'name' => (string) ($payload['name'] ?? 'Admin'),
                        'role' => (string) ($payload['role'] ?? ''),
                    ];
                    $this->activity()->log($r, 'logout', 'user', (int) ($r->user['sub'] ?? 0), $r->user['name'] ?? null);
                }
            }
        } catch (\Throwable) {
            // ignore expired tokens on logout
        }
        AuthCookie::clear();
        Response::json(['message' => 'Logged out']);
    }

    public function me(Request $r): never
    {
        // MCP machine token — no users row (sub=0)
        if (($r->user['auth'] ?? '') === 'mcp_token') {
            Response::json(['data' => [
                'id' => 0,
                'email' => $r->user['email'] ?? 'mcp@cms.local',
                'name' => $r->user['name'] ?? 'MCP Agent',
                'role' => $r->user['role'] ?? 'admin',
                'totp_enabled' => false,
                'auth' => 'mcp_token',
            ]]);
        }

        try {
            $this->ensureTotpColumns();
        } catch (\Throwable) {
            // Schema may be locked; still return profile without 2FA flag.
        }
        $hasTotp = $this->db->inspector()->columnExists('users', 'totp_enabled');
        $cols = $hasTotp
            ? 'id, email, name, role, totp_enabled, last_login_at, created_at'
            : 'id, email, name, role, last_login_at, created_at';
        $user = $this->db->one("SELECT {$cols} FROM users WHERE id=?", [$r->user['sub'] ?? 0]);
        if (!$user) {
            Response::error('Unauthorized', 401);
        }
        $user['totp_enabled'] = (bool) ($user['totp_enabled'] ?? false);
        // Re-issue media cookie for sessions that logged in before cookie support.
        $bearer = $r->bearer();
        if ($bearer) {
            AuthCookie::set($bearer, (int) ($this->app['jwt_ttl'] ?? 3600));
        }
        Response::json(['data' => $user]);
    }

    /** Start 2FA enrollment — returns secret + otpauth URL (not yet enabled). */
    public function setup2fa(Request $r): never
    {
        try {
            $this->ensureTotpColumns();
        } catch (\Throwable $e) {
            Response::error('Cannot prepare 2FA columns: ' . $e->getMessage(), 500);
        }
        $user = $this->db->one('SELECT * FROM users WHERE id=?', [$r->user['sub'] ?? 0]);
        if (!$user) {
            Response::error('Unauthorized', 401);
        }
        $secret = $this->totp()->generateSecret();
        // Stash pending secret briefly in JWT so enable can confirm without writing first.
        $pending = $this->token($user, 600, '2fa_setup', ['totp_secret' => $secret]);
        $issuer = (string) ($this->app['name'] ?? 'Jasefly CMS');
        Response::json([
            'data' => [
                'secret' => $secret,
                'otpauth_url' => $this->totp()->otpAuthUrl($secret, (string) $user['email'], $issuer),
                'setup_token' => $pending,
            ],
        ]);
    }

    public function enable2fa(Request $r): never
    {
        try {
            $this->ensureTotpColumns();
        } catch (\Throwable $e) {
            Response::error('Cannot prepare 2FA columns: ' . $e->getMessage(), 500);
        }
        $setup = (string) $r->input('setup_token');
        $code = (string) $r->input('code');
        if ($setup === '' || $code === '') {
            Response::error('setup_token and code are required', 422);
        }
        try {
            $payload = Jwt::decode($setup, $this->app['jwt_secret']);
        } catch (\Throwable) {
            Response::error('Invalid or expired 2FA setup — start setup again', 422);
        }
        if (($payload['type'] ?? '') !== '2fa_setup' || (int) ($payload['sub'] ?? 0) !== (int) ($r->user['sub'] ?? 0)) {
            Response::error('Invalid or expired 2FA setup — start setup again', 422);
        }
        $secret = (string) ($payload['totp_secret'] ?? '');
        if ($secret === '' || !$this->totp()->verify($secret, $code)) {
            Response::error('Invalid 2FA code — check the authenticator app and try the current 6-digit code', 422);
        }
        try {
            $this->db->run(
                'UPDATE users SET totp_secret=?, totp_enabled=1, totp_confirmed_at=NOW() WHERE id=?',
                [$secret, $r->user['sub']]
            );
        } catch (\Throwable $e) {
            Response::error('Failed to save 2FA: ' . $e->getMessage(), 500);
        }
        $this->activity()->log($r, '2fa_enable', 'user', (int) $r->user['sub'], $r->user['name'] ?? null);
        Response::json(['success' => true, 'data' => ['totp_enabled' => true]]);
    }

    public function disable2fa(Request $r): never
    {
        try {
            $this->ensureTotpColumns();
        } catch (\Throwable $e) {
            Response::error('Cannot prepare 2FA columns: ' . $e->getMessage(), 500);
        }
        $password = (string) $r->input('password');
        $code = (string) $r->input('code');
        $user = $this->db->one('SELECT * FROM users WHERE id=?', [$r->user['sub'] ?? 0]);
        if (!$user || !Password::verify($password, (string) $user['password_hash'])) {
            Response::error('Invalid password', 401);
        }
        if (!empty($user['totp_enabled']) && !empty($user['totp_secret'])) {
            if (!$this->totp()->verify((string) $user['totp_secret'], $code)) {
                Response::error('Invalid 2FA code', 401);
            }
        }
        $this->db->run(
            'UPDATE users SET totp_secret=NULL, totp_enabled=0, totp_confirmed_at=NULL WHERE id=?',
            [$user['id']]
        );
        $this->activity()->log($r, '2fa_disable', 'user', (int) $user['id'], $user['name']);
        Response::json(['success' => true, 'data' => ['totp_enabled' => false]]);
    }
}
