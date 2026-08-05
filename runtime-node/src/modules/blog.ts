import type { ModuleContext } from '../core/types.js';
import { requireAdmin } from '../core/authMiddleware.js';
import { ok, fail } from '../http/envelope.js';
import { notDeletedClause } from './_helpers.js';

export const name = 'blog';

export async function register(ctx: ModuleContext) {
  const admin = requireAdmin(ctx.auth);

  for (const p of ctx.apiPrefixes) {
    ctx.app.get(`${p}/blog`, async (c) => {
      if (!(await ctx.db.tableExists('blog_posts'))) return ok(c, { items: [] });
      const del = await notDeletedClause(ctx.db, 'blog_posts');
      const cols = await ctx.db.columns('blog_posts');
      const statusFilter = cols.includes('status') ? " AND status='published'" : '';
      const items = await ctx.db.all(
        `SELECT * FROM blog_posts WHERE 1=1${statusFilter}${del} ORDER BY id DESC LIMIT 100`,
      );
      return ok(c, { items });
    });

    ctx.app.get(`${p}/blog/:slug`, async (c) => {
      if (!(await ctx.db.tableExists('blog_posts'))) return fail(c, 'Not found', 404);
      const del = await notDeletedClause(ctx.db, 'blog_posts');
      const cols = await ctx.db.columns('blog_posts');
      const statusFilter = cols.includes('status') ? " AND status='published'" : '';
      const row = await ctx.db.one(
        `SELECT * FROM blog_posts WHERE slug=?${statusFilter}${del} LIMIT 1`,
        [c.req.param('slug')],
      );
      if (!row) return fail(c, 'Not found', 404);
      return ok(c, row);
    });

    ctx.app.post(`${p}/admin/blog/:id/publish`, admin, async (c) =>
      ctx.crud.publish(c, 'blog', c.req.param('id')),
    );
  }
}
