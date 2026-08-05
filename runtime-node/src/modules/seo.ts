import type { ModuleContext } from '../core/types.js';
import { requireAdmin } from '../core/authMiddleware.js';
import { fail, ok } from '../http/envelope.js';
import { nowSql, readJsonBody } from './_helpers.js';

export const name = 'seo';

export async function register(ctx: ModuleContext) {
  const admin = requireAdmin(ctx.auth);

  for (const p of ctx.apiPrefixes) {
    ctx.app.get(`${p}/admin/redirects`, admin, async (c) => {
      if (!(await ctx.db.tableExists('path_redirects'))) return ok(c, []);
      return ok(c, await ctx.db.all('SELECT * FROM path_redirects ORDER BY id DESC'));
    });

    ctx.app.post(`${p}/admin/redirects`, admin, async (c) => {
      if (!(await ctx.db.tableExists('path_redirects'))) return fail(c, 'capability_unavailable', 409);
      const body = await readJsonBody(c);
      if (body instanceof Response) return body;
      const fromPath = String(body.from_path ?? '').trim();
      const toPath = String(body.to_path ?? '').trim();
      if (!fromPath || !toPath) return fail(c, 'Validation failed', 422);
      await ctx.db.run(
        'INSERT INTO path_redirects (from_path, to_path, status_code, is_active, note, created_at) VALUES (?, ?, ?, ?, ?, ?)',
        [
          fromPath,
          toPath,
          Number(body.status_code ?? 301),
          body.is_active === false ? 0 : 1,
          body.note ?? null,
          nowSql(),
        ],
      );
      const id = await ctx.db.lastInsertId();
      await ctx.events.publish('resource.afterSave', { resource: 'redirects', table: 'path_redirects', id, op: 'create' });
      return ok(c, await ctx.db.one('SELECT * FROM path_redirects WHERE id=?', [id]), 201);
    });

    ctx.app.put(`${p}/admin/redirects/:id`, admin, async (c) => {
      if (!(await ctx.db.tableExists('path_redirects'))) return fail(c, 'capability_unavailable', 409);
      const id = c.req.param('id');
      const existing = await ctx.db.one('SELECT * FROM path_redirects WHERE id=?', [id]);
      if (!existing) return fail(c, 'Not found', 404);
      const body = await readJsonBody(c);
      if (body instanceof Response) return body;
      await ctx.db.run(
        'UPDATE path_redirects SET from_path=?, to_path=?, status_code=?, is_active=?, note=?, updated_at=? WHERE id=?',
        [
          String(body.from_path ?? existing.from_path),
          String(body.to_path ?? existing.to_path),
          Number(body.status_code ?? existing.status_code ?? 301),
          body.is_active === undefined ? existing.is_active : body.is_active ? 1 : 0,
          body.note ?? existing.note,
          nowSql(),
          id,
        ],
      );
      return ok(c, await ctx.db.one('SELECT * FROM path_redirects WHERE id=?', [id]));
    });

    ctx.app.delete(`${p}/admin/redirects/:id`, admin, async (c) => {
      if (!(await ctx.db.tableExists('path_redirects'))) return fail(c, 'capability_unavailable', 409);
      await ctx.db.run('DELETE FROM path_redirects WHERE id=?', [c.req.param('id')]);
      return ok(c, { ok: true });
    });

    ctx.app.post(`${p}/admin/seo/prerender/flush`, admin, async (c) => ok(c, { flushed: true, cleared: 0 }));
    ctx.app.post(`${p}/admin/seo/prerender-flush`, admin, async (c) => ok(c, { flushed: true, cleared: 0 }));

    ctx.app.get(`${p}/admin/seo/prerender-preview`, admin, async (c) => {
      const pagePath = String(c.req.query('path') ?? '/');
      let title = '';
      if (await ctx.db.tableExists('pages')) {
        const slug = pagePath.replace(/^\//, '') || 'home';
        const row = await ctx.db.one("SELECT title FROM pages WHERE slug=? AND status='published' LIMIT 1", [slug]);
        title = String(row?.title ?? '');
      }
      const preview = title || pagePath;
      return ok(c, {
        path: pagePath,
        status: 200,
        html_preview: preview.slice(0, 500),
        bytes: preview.length,
      });
    });

    ctx.app.get(`${p}/admin/redirects/slug`, admin, async (c) => {
      if (!(await ctx.db.tableExists('slug_redirects'))) return ok(c, []);
      try {
        return ok(c, await ctx.db.all(
          'SELECT id, entity_type, old_slug, new_slug, entity_id, created_at FROM slug_redirects ORDER BY id DESC LIMIT 200',
        ));
      } catch {
        return ok(c, []);
      }
    });

    ctx.app.delete(`${p}/admin/redirects/slug/:id`, admin, async (c) => {
      if (!(await ctx.db.tableExists('slug_redirects'))) return fail(c, 'Not found', 404);
      try {
        await ctx.db.run('DELETE FROM slug_redirects WHERE id=?', [c.req.param('id')]);
      } catch {
        return fail(c, 'Not found', 404);
      }
      return ok(c, { ok: true, message: 'Deleted' });
    });
  }
}
