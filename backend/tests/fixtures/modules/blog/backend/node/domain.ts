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



export async function register(ctx: PlatformContext) {
  const http = ctx.http();
  const db = ctx.database();
  const events = ctx.events();
  const admin = http.admin();
  const crud = ctx.adminResources();
  void admin;
  void crud;


    http.get('/blog', async (c) => {
      if (!(await db.tableExists('blog_posts'))) return http.ok(c, []);
      const del = await notDeletedClause(db, 'blog_posts');
      const cols = await db.columns('blog_posts');
      const statusFilter = cols.includes('status') ? " AND status='published'" : '';
      const items = await db.all(
        `SELECT * FROM blog_posts WHERE 1=1${statusFilter}${del} ORDER BY id DESC LIMIT 100`,
      );
      return http.ok(c, items);
    });

    http.get('/blog/:slug', async (c) => {
      if (!(await db.tableExists('blog_posts'))) return http.fail(c, 'Not found', 404);
      const del = await notDeletedClause(db, 'blog_posts');
      const cols = await db.columns('blog_posts');
      const statusFilter = cols.includes('status') ? " AND status='published'" : '';
      const row = await db.one(
        `SELECT * FROM blog_posts WHERE slug=?${statusFilter}${del} LIMIT 1`,
        [c.req.param('slug')],
      );
      if (!row) return http.fail(c, 'Not found', 404);
      return http.ok(c, row);
    });

    http.post('/admin/blog/:id/publish', admin, async (c) =>
      crud!.publish(c, 'blog', c.req.param('id')),
    );
  
}
