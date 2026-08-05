import crypto from 'node:crypto';
import type { ModuleContext } from '../core/types.js';
import { requireAdmin } from '../core/authMiddleware.js';
import { fail, ok } from '../http/envelope.js';
import { jwtEncode } from '../auth/jwt.js';
import { sha256Hex } from '../auth/password.js';
import { nowSql } from './_helpers.js';

export const name = 'demo';

export async function register(ctx: ModuleContext) {
  for (const p of ctx.apiPrefixes) {
    ctx.app.post(`${p}/auth/demo/start`, async (c) => {
      if (!(await ctx.db.tableExists('demo_sessions'))) {
        return fail(c, 'capability_unavailable', 503, null, { code: 'demo_unavailable' });
      }

      const sessionId = crypto.randomBytes(16).toString('hex');
      const rawToken = crypto.randomBytes(32).toString('hex');
      const tokenHash = sha256Hex(rawToken);
      const expires = new Date(Date.now() + 3600_000).toISOString().slice(0, 19).replace('T', ' ');
      const ip = c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ?? null;
      const ua = (c.req.header('user-agent') ?? '').slice(0, 255);

      await ctx.db.run(
        'INSERT INTO demo_sessions (id, token_hash, expires_at, ip_address, user_agent, created_at) VALUES (?, ?, ?, ?, ?, ?)',
        [sessionId, tokenHash, expires, ip, ua, nowSql()],
      );

      const now = Math.floor(Date.now() / 1000);
      const accessToken = await jwtEncode(
        {
          sub: 0,
          email: 'demo@local',
          name: 'Demo',
          role: 'editor',
          type: 'demo',
          demo_session_id: sessionId,
          iat: now,
          exp: now + 3600,
        },
        ctx.cfg.jwtSecret,
      );

      return ok(c, {
        access_token: accessToken,
        expires_in: 3600,
        is_demo: true,
        demo_session_id: sessionId,
        runtime: ctx.cfg.runtime,
      });
    });

    ctx.app.post(`${p}/auth/demo/reset`, async (c) => fail(c, 'demo_unauthorized', 401, null, { code: 'demo_unauthorized' }));
    ctx.app.post(`${p}/auth/demo/end`, async (c) => ok(c, { ok: true }));

    ctx.app.get(`${p}/admin/demo/bootstrap`, requireAdmin(ctx.auth), async (c) => {
      const user = await ctx.auth.meFromBearer(c.req.header('authorization'));
      if (!user || user === 'mcp') return fail(c, 'Unauthorized', 401, null, { code: 'demo_unauthorized' });
      const demoUser = user as { demo?: boolean; demo_session_id?: string };
      if (!demoUser.demo) return fail(c, 'Unauthorized', 401, null, { code: 'demo_unauthorized' });
      return ok(c, {
        is_demo: true,
        demo_session_id: demoUser.demo_session_id ?? null,
        capabilities: ['*'],
        nav: [],
      });
    });

    ctx.app.post(`${p}/admin/demo/cleanup`, requireAdmin(ctx.auth), async (c) => {
      const user = await ctx.auth.meFromBearer(c.req.header('authorization'));
      if (!user || user === 'mcp') return fail(c, 'Unauthorized', 401);
      const demoUser = user as { demo?: boolean };
      if (!demoUser.demo) return fail(c, 'Unauthorized', 401);
      if (!(await ctx.db.tableExists('demo_sessions'))) return ok(c, { removed: 0 });
      const now = nowSql();
      await ctx.db.run('DELETE FROM demo_sessions WHERE expires_at < ?', [now]);
      const row = await ctx.db.one('SELECT COUNT(*) AS c FROM demo_sessions');
      return ok(c, { removed: Number(row?.c ?? 0) });
    });
  }
}
