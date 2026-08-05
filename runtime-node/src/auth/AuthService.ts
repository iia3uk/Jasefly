import { randomBytes } from 'node:crypto';
import type { AppConfig } from '../config.js';
import type { Database, Row } from '../db/Database.js';
import { jwtDecode, jwtEncode } from './jwt.js';
import { hashPassword, needsRehash, sha256Hex, verifyPassword } from './password.js';

function userBrief(user: Row) {
  return {
    id: Number(user.id),
    email: String(user.email),
    name: String(user.name ?? ''),
    role: String(user.role ?? 'admin'),
    totp_enabled: Boolean(Number(user.totp_enabled ?? 0)),
  };
}

export class AuthService {
  constructor(
    private db: Database,
    private cfg: AppConfig,
  ) {}

  async login(email: string, password: string): Promise<
    | { ok: true; kind: 'session'; data: Record<string, unknown> }
    | { ok: true; kind: '2fa'; data: Record<string, unknown> }
    | { ok: false; error: string; status: number }
  > {
    if (!this.cfg.jwtSecret) {
      return { ok: false, error: 'JWT not configured', status: 503 };
    }
    const user = await this.db.one('SELECT * FROM users WHERE email=?', [email.toLowerCase().trim()]);
    if (!user || !(await verifyPassword(password, String(user.password_hash ?? '')))) {
      return { ok: false, error: 'Invalid credentials', status: 401 };
    }
    if (needsRehash(String(user.password_hash ?? ''))) {
      await this.db.run('UPDATE users SET password_hash=? WHERE id=?', [
        await hashPassword(password),
        user.id,
      ]);
    }
    if (Number(user.totp_enabled) && user.totp_secret) {
      const challenge = await this.token(user, 300, '2fa_challenge');
      return {
        ok: true,
        kind: '2fa',
        data: { requires_2fa: true, challenge_token: challenge, expires_in: 300 },
      };
    }
    return { ok: true, kind: 'session', data: await this.issueSession(user) };
  }

  async setup2fa(user: Row) {
    const { authenticator } = await import('otplib');
    const secret = authenticator.generateSecret();
    const setup_token = await this.token(user, 600, '2fa_setup', { totp_secret: secret });
    const issuer = this.cfg.name || 'Jasefly';
    return {
      secret,
      otpauth_url: authenticator.keyuri(String(user.email), issuer, secret),
      setup_token,
    };
  }

  async enable2fa(user: Row, setupToken: string, code: string) {
    try {
      const payload = await jwtDecode(setupToken, this.cfg.jwtSecret);
      if (payload.type !== '2fa_setup' || Number(payload.sub) !== Number(user.id)) {
        return { ok: false as const, error: 'Invalid or expired 2FA setup — start setup again', status: 422 };
      }
      const secret = String(payload.totp_secret ?? '');
      const { authenticator } = await import('otplib');
      if (!secret || !authenticator.check(code, secret)) {
        return {
          ok: false as const,
          error: 'Invalid 2FA code — check the authenticator app and try the current 6-digit code',
          status: 422,
        };
      }
      await this.db.run('UPDATE users SET totp_secret=?, totp_enabled=1 WHERE id=?', [secret, user.id]);
      return { ok: true as const, data: { totp_enabled: true } };
    } catch {
      return { ok: false as const, error: 'Invalid or expired 2FA setup — start setup again', status: 422 };
    }
  }

  async disable2fa(user: Row, password: string, code: string) {
    if (!(await verifyPassword(password, String(user.password_hash ?? '')))) {
      return { ok: false as const, error: 'Invalid password', status: 401 };
    }
    if (Number(user.totp_enabled) && user.totp_secret) {
      const { authenticator } = await import('otplib');
      if (!authenticator.check(code, String(user.totp_secret))) {
        return { ok: false as const, error: 'Invalid 2FA code', status: 401 };
      }
    }
    await this.db.run('UPDATE users SET totp_secret=NULL, totp_enabled=0 WHERE id=?', [user.id]);
    return { ok: true as const, data: { totp_enabled: false } };
  }

  async verify2fa(challengeToken: string, code: string) {
    try {
      const payload = await jwtDecode(challengeToken, this.cfg.jwtSecret);
      if (payload.type !== '2fa_challenge') throw new Error('bad type');
      const user = await this.db.one('SELECT * FROM users WHERE id=?', [payload.sub]);
      if (!user) return { ok: false as const, error: 'Invalid or expired 2FA challenge', status: 401 };
      // Minimal TOTP: accept matching stored backup style — full TotpService parity in module
      const { authenticator } = await import('otplib');
      const okTotp = authenticator.check(code, String(user.totp_secret));
      if (!okTotp) return { ok: false as const, error: 'Invalid or expired 2FA challenge', status: 401 };
      return { ok: true as const, data: await this.issueSession(user) };
    } catch {
      return { ok: false as const, error: 'Invalid or expired 2FA challenge', status: 401 };
    }
  }

  async refresh(refreshToken: string) {
    try {
      const payload = await jwtDecode(refreshToken, this.cfg.jwtSecret);
      if (payload.type !== 'refresh') throw new Error('bad');
      const hash = sha256Hex(refreshToken);
      const row = await this.db.one('SELECT * FROM refresh_tokens WHERE token_hash=? LIMIT 1', [hash]);
      if (!row) return { ok: false as const, error: 'Invalid refresh token', status: 401 };
      await this.db.run('DELETE FROM refresh_tokens WHERE token_hash=?', [hash]);
      const user = await this.db.one('SELECT * FROM users WHERE id=?', [payload.sub]);
      if (!user) return { ok: false as const, error: 'Invalid refresh token', status: 401 };
      return { ok: true as const, data: await this.issueSession(user) };
    } catch {
      return { ok: false as const, error: 'Invalid refresh token', status: 401 };
    }
  }

  async meFromBearer(authHeader: string | undefined): Promise<Row | 'mcp' | null> {
    if (!authHeader?.startsWith('Bearer ')) return null;
    const token = authHeader.slice(7).trim();
    if (this.cfg.mcpApiToken && token === this.cfg.mcpApiToken) return 'mcp';
    try {
      const payload = await jwtDecode(token, this.cfg.jwtSecret);
      // PHP DemoSessionService::issueToken → type=demo_access, demo_sid
      if (payload.type === 'demo' || payload.type === 'demo_access' || payload.is_demo === true) {
        return {
          id: -1,
          email: 'demo@jasefly.local',
          name: 'Demo Explorer',
          role: 'demo_explorer',
          demo: true,
          is_demo: true,
          demo_session_id: payload.demo_sid ?? payload.demo_session_id ?? null,
        };
      }
      if (payload.type && payload.type !== 'access') return null;
      const user = await this.db.one('SELECT * FROM users WHERE id=?', [payload.sub]);
      return user;
    } catch {
      return null;
    }
  }

  async mePayload(user: Row | 'mcp') {
    if (user === 'mcp') {
      return {
        id: 0,
        email: 'mcp@cms.local',
        name: 'MCP Agent',
        role: 'admin',
        totp_enabled: false,
        auth: 'mcp_token',
      };
    }
    // Lazy import avoids circular AuthService ↔ AccessService at module load.
    const { AccessService } = await import('../access/AccessService.js');
    const access = new AccessService(this.db, this);
    const bundle = await access.resolveEffective(Number(user.id));
    return {
      ...userBrief(user),
      last_login_at: user.last_login_at ?? null,
      created_at: user.created_at ?? null,
      capabilities: bundle.caps,
      roles: bundle.roles.length ? bundle.roles : [String(user.role ?? '')],
      is_super: bundle.is_super,
      caps_version: bundle.version,
    };
  }

  private async capabilitiesFor(_user: Row): Promise<string[]> {
    return [];
  }

  private async token(user: Row, ttl: number, type: string, extra: Record<string, unknown> = {}) {
    const now = Math.floor(Date.now() / 1000);
    return jwtEncode(
      {
        sub: Number(user.id),
        email: user.email,
        name: user.name,
        role: user.role ?? 'admin',
        type,
        iat: now,
        exp: now + ttl,
        jti: cryptoRandom(),
        ...extra,
      },
      this.cfg.jwtSecret,
    );
  }

  private async issueSession(user: Row) {
    const access = await this.token(user, this.cfg.jwtTtl, 'access');
    const refresh = await this.token(user, this.cfg.refreshTtl, 'refresh');
    const hash = sha256Hex(refresh);
    const exp = new Date(Date.now() + this.cfg.refreshTtl * 1000)
      .toISOString()
      .slice(0, 19)
      .replace('T', ' ');
    if (await this.db.tableExists('refresh_tokens')) {
      await this.db.run(
        'INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES (?, ?, ?)',
        [user.id, hash, exp],
      );
    }
    if (await this.db.tableExists('users')) {
      const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
      await this.db.run('UPDATE users SET last_login_at=? WHERE id=?', [now, user.id]);
    }
    // PHP AuthController logs login into activity_logs
    if (await this.db.tableExists('activity_logs')) {
      try {
        const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
        const cols = await this.db.columns('activity_logs');
        const name = String(user.name ?? '');
        if (cols.includes('source')) {
          await this.db.run(
            `INSERT INTO activity_logs (user_id, user_name, source, action, entity_type, entity_id, entity_label, metadata, ip_address)
             VALUES (?, ?, 'admin', 'login', 'user', ?, ?, ?, ?)`,
            [user.id, name, user.id, name, JSON.stringify({ source: 'admin' }), '127.0.0.1'],
          );
        } else {
          await this.db.run(
            `INSERT INTO activity_logs (user_id, user_name, action, entity_type, entity_id, entity_label, metadata, ip_address)
             VALUES (?, ?, 'login', 'user', ?, ?, ?, ?)`,
            [user.id, name, user.id, name, JSON.stringify({ source: 'admin' }), '127.0.0.1'],
          );
        }
      } catch {
        /* never break login */
      }
    }
    return {
      requires_2fa: false,
      access_token: access,
      refresh_token: refresh,
      expires_in: this.cfg.jwtTtl,
      user: userBrief(user),
    };
  }
}

function cryptoRandom(): string {
  return randomBytes(12).toString('hex');
}
