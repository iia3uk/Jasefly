import type { Context } from 'hono';
import type { ModuleContext } from '../core/types.js';
import { requireAdmin } from '../core/authMiddleware.js';
import { fail, ok } from '../http/envelope.js';
import type { Database } from '../db/Database.js';

export const name = 'projects';

const RESOURCES = ['projects', 'project-categories'] as const;
const PLUGIN = 'projects';

async function isPluginEnabled(db: Database): Promise<boolean> {
  if (!(await db.tableExists('modules'))) return true;
  const row = await db.one('SELECT is_enabled FROM modules WHERE name=?', [PLUGIN]);
  return row == null ? true : Boolean(row.is_enabled);
}

async function softGate(
  c: Context,
  db: Database,
  method: string,
  isItem: boolean,
): Promise<Response | null> {
  if (await isPluginEnabled(db)) return null;
  const m = method.toUpperCase();
  if (m === 'GET' && !isItem) return ok(c, []);
  if (m === 'GET') return fail(c, 'Not found', 404);
  return fail(c, 'Plugin disabled', 409, null, { code: 'plugin_disabled', plugin: PLUGIN });
}

export async function register(ctx: ModuleContext) {
  const admin = requireAdmin(ctx.auth);

  for (const p of ctx.apiPrefixes) {
    for (const resource of RESOURCES) {
      const base = `${p}/admin/${resource}`;

      ctx.app.get(base, admin, async (c) => {
        const blocked = await softGate(c, ctx.db, 'GET', false);
        if (blocked) return blocked;
        return ctx.crud.list(c, resource);
      });
      ctx.app.post(base, admin, async (c) => {
        const blocked = await softGate(c, ctx.db, 'POST', false);
        if (blocked) return blocked;
        return ctx.crud.create(c, resource);
      });
      ctx.app.get(`${base}/:id`, admin, async (c) => {
        const blocked = await softGate(c, ctx.db, 'GET', true);
        if (blocked) return blocked;
        return ctx.crud.show(c, resource, c.req.param('id'));
      });
      ctx.app.put(`${base}/:id`, admin, async (c) => {
        const blocked = await softGate(c, ctx.db, 'PUT', true);
        if (blocked) return blocked;
        return ctx.crud.update(c, resource, c.req.param('id'));
      });
      ctx.app.delete(`${base}/:id`, admin, async (c) => {
        const blocked = await softGate(c, ctx.db, 'DELETE', true);
        if (blocked) return blocked;
        return ctx.crud.remove(c, resource, c.req.param('id'));
      });
    }

    ctx.app.post(`${p}/admin/projects/:id/publish`, admin, async (c) => {
      const blocked = await softGate(c, ctx.db, 'POST', true);
      if (blocked) return blocked;
      return ctx.crud.publish(c, 'projects', c.req.param('id'));
    });
    ctx.app.post(`${p}/admin/projects/reorder`, admin, async (c) => {
      const blocked = await softGate(c, ctx.db, 'POST', false);
      if (blocked) return blocked;
      return ctx.crud.reorder(c, 'projects');
    });
  }
}
