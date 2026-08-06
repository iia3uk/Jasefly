import type { Context } from 'hono';
import type { ModuleContext } from '../core/types.js';
import { requireAdmin } from '../core/authMiddleware.js';
import { fail, ok } from '../http/envelope.js';
import type { Database } from '../db/Database.js';
import { isModuleEnabled } from '../plugins/pluginState.js';
import { softDecide, softRespond } from '../plugins/softPluginGate.js';

export const name = 'projects';

const RESOURCES = ['projects', 'project-categories'] as const;
const PLUGIN = 'projects';

async function softGate(
  c: Context,
  db: Database,
  method: string,
  isItem: boolean,
): Promise<Response | null> {
  const on = await isModuleEnabled(db, PLUGIN);
  return softRespond(c, softDecide(on, method, isItem), PLUGIN);
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
