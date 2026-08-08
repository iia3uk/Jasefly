import type { Context } from 'hono';
import type { PlatformContext } from './sdk/platform-types.js';
import {
  nowSql,
  publicId,
  notDeletedClause,
  readJsonBody,
  loadModuleSettings,
  saveModuleSettings,
} from './sdk/helpers.js';



const RESOURCES = ['projects', 'project-categories'] as const;
const PLUGIN = 'projects';

async function softGate(ctx: PlatformContext, c: Context, method: string, isItem: boolean) {
  return ctx.plugins().softGate(c, method, isItem);
}

export async function register(ctx: PlatformContext) {
  const http = ctx.http();
  const db = ctx.database();
  const events = ctx.events();
  const admin = http.admin();
  const crud = ctx.adminResources();
  void admin;
  void crud;


    // Public projects API (moved from host content module)
    http.get('/projects', async (c) => {
      if (!(await db.tableExists('projects'))) return http.ok(c, []);
      const cols = await db.columns('projects');
      const del = cols.includes('deleted_at') ? ' AND deleted_at IS NULL' : '';
      const items = await db.all(`SELECT * FROM projects WHERE 1=1${del} ORDER BY id DESC`);
      return http.ok(c, items);
    });
    http.get('/projects/:slug', async (c) => {
      const row = await db.one('SELECT * FROM projects WHERE slug=? LIMIT 1', [c.req.param('slug')]);
      if (!row) return http.fail(c, 'Not found', 404);
      return http.ok(c, row);
    });

    for (const resource of RESOURCES) {
      const baseRel = '/admin/${resource}';

      http.get(baseRel, admin, async (c) => {
        const blocked = await ctx.plugins().softGate(c, 'GET', false);
        if (blocked) return blocked;
        return crud!.list(c, resource);
      });
      http.post(baseRel, admin, async (c) => {
        const blocked = await ctx.plugins().softGate(c, 'POST', false);
        if (blocked) return blocked;
        return crud!.create(c, resource);
      });
      http.get(`${baseRel}/:id`, admin, async (c) => {
        const blocked = await ctx.plugins().softGate(c, 'GET', true);
        if (blocked) return blocked;
        return crud!.show(c, resource, c.req.param('id'));
      });
      http.put(`${baseRel}/:id`, admin, async (c) => {
        const blocked = await ctx.plugins().softGate(c, 'PUT', true);
        if (blocked) return blocked;
        return crud!.update(c, resource, c.req.param('id'));
      });
      http.delete(`${baseRel}/:id`, admin, async (c) => {
        const blocked = await ctx.plugins().softGate(c, 'DELETE', true);
        if (blocked) return blocked;
        return crud!.remove(c, resource, c.req.param('id'));
      });
    }

    http.post('/admin/projects/:id/publish', admin, async (c) => {
      const blocked = await ctx.plugins().softGate(c, 'POST', true);
      if (blocked) return blocked;
      return crud!.publish(c, 'projects', c.req.param('id'));
    });
    http.post('/admin/projects/reorder', admin, async (c) => {
      const blocked = await ctx.plugins().softGate(c, 'POST', false);
      if (blocked) return blocked;
      return crud!.reorder(c, 'projects');
    });
  
}
