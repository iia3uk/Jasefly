import crypto from 'node:crypto';
import type { ModuleContext } from '../core/types.js';
import { requireAdmin } from '../core/authMiddleware.js';
import { fail, ok } from '../http/envelope.js';
import { jwtEncode } from '../auth/jwt.js';
import { sha256Hex } from '../auth/password.js';
import { nowSql } from './_helpers.js';

export const name = 'demo';

/** PHP DemoSessionService::TTL_SECONDS / DEMO_USER_ID */
const TTL_SECONDS = 7200;
const DEMO_USER_ID = -1;

/** PHP DemoCapabilityPolicy::ALLOWED */
const DEMO_CAPABILITIES = [
  'demo.session',
  'demo.builder.edit',
  'demo.content.view',
  'demo.content.edit',
  'demo.media.view',
  'demo.preview',
  'dashboard.view',
  'content.view',
  'content.create',
  'content.edit_own',
  'content.update',
  'builder.use',
  'pages.manage',
  'media.manage',
  'modules.view',
  'settings.view',
  'seo.manage',
  'system.logs',
] as const;

/** PHP DemoSessionService::syntheticUser() */
function syntheticUser(): Record<string, unknown> {
  return {
    id: DEMO_USER_ID,
    email: 'demo@jasefly.local',
    name: 'Demo Explorer',
    role: 'demo_explorer',
    roles: ['demo_explorer'],
    is_super: false,
    is_demo: true,
    totp_enabled: false,
    capabilities: [...DEMO_CAPABILITIES],
    caps_version: 'demo-1',
  };
}

export async function register(ctx: ModuleContext) {
  for (const p of ctx.apiPrefixes) {
    ctx.app.post(`${p}/auth/demo/start`, async (c) => {
      if (!(await ctx.db.tableExists('demo_sessions'))) {
        return fail(c, 'capability_unavailable', 503, null, { code: 'demo_unavailable' });
      }

      try {
        // PHP DemoSessionService::cleanupExpired (best-effort)
        try {
          await ctx.db.run('DELETE FROM demo_sessions WHERE expires_at < ?', [nowSql()]);
        } catch {
          /* ignore */
        }

        const sessionId = crypto.randomBytes(16).toString('hex');
        const now = Math.floor(Date.now() / 1000);
        // PHP Jwt::encode payload (DemoSessionService::issueToken)
        const accessToken = await jwtEncode(
          {
            sub: DEMO_USER_ID,
            name: 'Demo Explorer',
            email: 'demo@jasefly.local',
            role: 'demo_explorer',
            type: 'demo_access',
            is_demo: true,
            demo_sid: sessionId,
            exp: now + TTL_SECONDS,
          },
          ctx.cfg.jwtSecret,
        );
        const tokenHash = sha256Hex(accessToken);
        const expires = new Date(Date.now() + TTL_SECONDS * 1000).toISOString().slice(0, 19).replace('T', ' ');
        const ip = c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ?? c.req.header('x-real-ip') ?? null;
        const ua = (c.req.header('user-agent') ?? '').slice(0, 255);

        const cols = await ctx.db.columns('demo_sessions');
        if (cols.includes('last_seen_at') && cols.includes('created_at')) {
          await ctx.db.run(
            'INSERT INTO demo_sessions (id, token_hash, expires_at, ip_address, user_agent, last_seen_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [sessionId, tokenHash, expires, ip, ua, nowSql(), nowSql()],
          );
        } else if (cols.includes('last_seen_at')) {
          await ctx.db.run(
            'INSERT INTO demo_sessions (id, token_hash, expires_at, ip_address, user_agent, last_seen_at) VALUES (?, ?, ?, ?, ?, ?)',
            [sessionId, tokenHash, expires, ip, ua, nowSql()],
          );
        } else {
          await ctx.db.run(
            'INSERT INTO demo_sessions (id, token_hash, expires_at, ip_address, user_agent, created_at) VALUES (?, ?, ?, ?, ?, ?)',
            [sessionId, tokenHash, expires, ip, ua, nowSql()],
          );
        }

        // PHP DemoSessionService::start return (+ DemoModule keeps access_token)
        return ok(c, {
          session_id: sessionId,
          access_token: accessToken,
          expires_in: TTL_SECONDS,
          is_demo: true,
          user: syntheticUser(),
          capabilities: [...DEMO_CAPABILITIES],
          home_page_id: 900001,
          admin_entry: '/demo',
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return fail(c, `Cannot start demo session: ${msg}`, 503, [], { code: 'demo_unavailable' });
      }
    });

    ctx.app.post(`${p}/auth/demo/reset`, async (c) => fail(c, 'Unauthorized', 401, [], { code: 'demo_unauthorized' }));
    ctx.app.post(`${p}/auth/demo/end`, async (c) => ok(c, { ok: true }));

    ctx.app.get(`${p}/admin/demo/bootstrap`, requireAdmin(ctx.auth), async (c) => {
      const user = await ctx.auth.meFromBearer(c.req.header('authorization'));
      if (!user || user === 'mcp') return fail(c, 'Unauthorized', 401, null, { code: 'demo_unauthorized' });
      const demoUser = user as { demo?: boolean; is_demo?: boolean; demo_session_id?: string };
      if (!demoUser.demo && !demoUser.is_demo) {
        return fail(c, 'Unauthorized', 401, null, { code: 'demo_unauthorized' });
      }
      return ok(c, {
        is_demo: true,
        demo_session_id: demoUser.demo_session_id ?? null,
        capabilities: [...DEMO_CAPABILITIES],
        nav: [],
      });
    });

    ctx.app.post(`${p}/admin/demo/cleanup`, requireAdmin(ctx.auth), async (c) => {
      const user = await ctx.auth.meFromBearer(c.req.header('authorization'));
      if (!user || user === 'mcp') return fail(c, 'Unauthorized', 401);
      const demoUser = user as { demo?: boolean; is_demo?: boolean };
      if (!demoUser.demo && !demoUser.is_demo) return fail(c, 'Unauthorized', 401);
      if (!(await ctx.db.tableExists('demo_sessions'))) return ok(c, { removed: 0 });
      const now = nowSql();
      await ctx.db.run('DELETE FROM demo_sessions WHERE expires_at < ?', [now]);
      const row = await ctx.db.one('SELECT COUNT(*) AS c FROM demo_sessions');
      return ok(c, { removed: Number(row?.c ?? 0) });
    });
  }
}
