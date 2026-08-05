import type { ModuleContext } from '../core/types.js';
import { requireAdmin } from '../core/authMiddleware.js';
import { AccessService } from '../access/AccessService.js';
import { fail, ok } from '../http/envelope.js';
import type { Row } from '../db/Database.js';

export const name = 'access';

function userIdFrom(user: Row | 'mcp' | null): number | null {
  if (!user || user === 'mcp') return user === 'mcp' ? 0 : null;
  const id = Number(user.id ?? 0);
  return id > 0 ? id : null;
}

export async function register(ctx: ModuleContext) {
  const access = new AccessService(ctx.db, ctx.auth);

  for (const p of ctx.apiPrefixes) {
    ctx.app.get(`${p}/access/providers`, async (c) => ok(c, access.providers()));

    ctx.app.post(`${p}/access/can`, async (c) => {
      const body = (await c.req.json().catch(() => ({}))) as {
        rule?: unknown;
        access?: unknown;
      };
      let rule = body.rule ?? body.access ?? null;
      if (typeof rule === 'string') {
        try {
          rule = JSON.parse(rule);
        } catch {
          rule = null;
        }
      }
      const user = await ctx.auth.meFromBearer(c.req.header('authorization'));
      const uid = user && user !== 'mcp' ? userIdFrom(user) : null;
      return ok(c, await access.can(uid, rule));
    });

    ctx.app.get(`${p}/admin/access/bootstrap`, requireAdmin(ctx.auth), async (c) => {
      const user = await ctx.auth.meFromBearer(c.req.header('authorization'));
      if (!user) return fail(c, 'Unauthorized', 401);
      const payload = await access.bootstrapPayload(user);
      if (!payload.is_super && payload.capabilities.length === 0) {
        return fail(c, 'Forbidden', 403, null, { code: 'forbidden', capability: 'dashboard.view' });
      }
      return ok(c, payload);
    });

    ctx.app.post(`${p}/admin/access/batch-can`, requireAdmin(ctx.auth), async (c) => {
      const body = (await c.req.json().catch(() => ({}))) as { capabilities?: unknown };
      if (!Array.isArray(body.capabilities)) return fail(c, 'capabilities array required', 422);
      const user = await ctx.auth.meFromBearer(c.req.header('authorization'));
      if (!user) return fail(c, 'Unauthorized', 401);
      return ok(c, await access.batchCan(user, body.capabilities.map(String)));
    });

    ctx.app.get(`${p}/admin/access/users/:id/effective`, requireAdmin(ctx.auth), async (c) => {
      // PHP AccessAdminController::effective — empty bundle for unknown/non-positive ids (not 404).
      const userId = Number(c.req.param('id'));
      const target = userId > 0 ? await ctx.db.one('SELECT * FROM users WHERE id=?', [userId]) : null;
      const bundle = await access.effectiveBundle(userId > 0 ? userId : 0, target);
      const cap = String(c.req.query('capability') ?? '').trim();
      return ok(c, {
        user_id: userId > 0 ? userId : 0,
        bundle,
        explain: cap
          ? { capability: cap, allowed: bundle.caps.includes('*') || bundle.caps.includes(cap) }
          : null,
      });
    });

    ctx.app.get(`${p}/admin/access/users/:id/overrides`, requireAdmin(ctx.auth), async (c) => {
      const userId = Number(c.req.param('id'));
      if (!(await ctx.db.tableExists('user_capability_overrides'))) return ok(c, []);
      return ok(c, await ctx.db.all(
        'SELECT capability_slug, effect, created_at FROM user_capability_overrides WHERE user_id=? ORDER BY capability_slug',
        [userId],
      ));
    });

    ctx.app.put(`${p}/admin/access/users/:id/overrides`, requireAdmin(ctx.auth), async (c) => {
      const userId = Number(c.req.param('id'));
      const body = (await c.req.json().catch(() => ({}))) as { overrides?: unknown };
      if (!Array.isArray(body.overrides)) return fail(c, 'overrides array required', 422);
      if (!(await ctx.db.tableExists('user_capability_overrides'))) return fail(c, 'capability_unavailable', 409);
      await ctx.db.run('DELETE FROM user_capability_overrides WHERE user_id=?', [userId]);
      for (const item of body.overrides) {
        if (!item || typeof item !== 'object') continue;
        const rec = item as Record<string, unknown>;
        const slug = String(rec.capability_slug ?? rec.capability ?? '').trim();
        const effect = String(rec.effect ?? '');
        if (!slug || !['allow', 'deny'].includes(effect)) continue;
        await ctx.db.run(
          'INSERT INTO user_capability_overrides (user_id, capability_slug, effect) VALUES (?, ?, ?)',
          [userId, slug, effect],
        );
      }
      const after = await ctx.db.all(
        'SELECT capability_slug, effect FROM user_capability_overrides WHERE user_id=?',
        [userId],
      );
      return ok(c, after);
    });

    ctx.app.put(`${p}/admin/access/users/:id/roles`, requireAdmin(ctx.auth), async (c) => {
      const userId = Number(c.req.param('id'));
      const body = (await c.req.json().catch(() => ({}))) as { roles?: unknown; primary?: unknown };
      if (!Array.isArray(body.roles) || body.roles.length === 0) return fail(c, 'roles array required', 422);
      const roleSlugs = [...new Set(body.roles.map((s) => String(s).toLowerCase().trim()).filter(Boolean))];
      const primary = String(body.primary ?? roleSlugs[0]).toLowerCase().trim();
      if (await ctx.db.tableExists('user_roles') && await ctx.db.tableExists('roles')) {
        await ctx.db.run('DELETE FROM user_roles WHERE user_id=?', [userId]);
        for (const slug of roleSlugs) {
          const role = await ctx.db.one('SELECT id FROM roles WHERE slug=?', [slug]);
          if (!role) continue;
          await ctx.db.run(
            'INSERT INTO user_roles (user_id, role_id, is_primary) VALUES (?, ?, ?)',
            [userId, role.id, slug === primary ? 1 : 0],
          );
        }
      }
      if (primary) await ctx.db.run('UPDATE users SET role=? WHERE id=?', [primary, userId]);
      const after = await ctx.db.all(
        'SELECT r.slug FROM user_roles ur INNER JOIN roles r ON r.id=ur.role_id WHERE ur.user_id=?',
        [userId],
      ).catch(() => []);
      const roles = after.length ? after.map((r) => String(r.slug)) : roleSlugs;
      return ok(c, { roles, primary });
    });
  }
}
