import type { ModuleContext } from '../core/types.js';
import { requireAdmin } from '../core/authMiddleware.js';
import { fail, ok } from '../http/envelope.js';
import { notDeletedClause, nowSql, readJsonBody } from './_helpers.js';

export const name = 'lab';

const LAB_ENTRIES = [
  { key: 'starter', label: 'Starter', description: 'Базовый изолированный эксперимент (карточки, кнопка, light/dark)' },
  { key: 'reference', label: 'Reference', description: 'Визуальный референс стиля, иерархии и локальной темы Lab' },
];

function isKnownEntry(key: string): boolean {
  return LAB_ENTRIES.some((e) => e.key === key);
}

async function findExperiment(db: ModuleContext['db'], id: string, withTrash = false) {
  if (!(await db.tableExists('lab_experiments'))) return null;
  const del = withTrash ? '' : await notDeletedClause(db, 'lab_experiments');
  return db.one(`SELECT * FROM lab_experiments WHERE id=?${del} LIMIT 1`, [id]);
}

async function setStatus(db: ModuleContext['db'], id: string, status: string) {
  const row = await findExperiment(db, id, true);
  if (!row) return null;
  await db.run('UPDATE lab_experiments SET status=?, updated_at=? WHERE id=?', [status, nowSql(), id]);
  return db.one('SELECT * FROM lab_experiments WHERE id=?', [id]);
}

export async function register(ctx: ModuleContext) {
  const admin = requireAdmin(ctx.auth);

  for (const p of ctx.apiPrefixes) {
    ctx.app.get(`${p}/lab/:slug`, async (c) => {
      if (!(await ctx.db.tableExists('lab_experiments'))) return fail(c, 'capability_unavailable', 409);
      const del = await notDeletedClause(ctx.db, 'lab_experiments');
      const cols = await ctx.db.columns('lab_experiments');
      const publicFilter = cols.includes('is_public') ? ' AND is_public=1' : '';
      const statusFilter = cols.includes('status') ? " AND status IN ('active','published')" : '';
      const row = await ctx.db.one(
        `SELECT * FROM lab_experiments WHERE slug=?${publicFilter}${statusFilter}${del} LIMIT 1`,
        [c.req.param('slug')],
      );
      if (!row) return fail(c, 'Not found', 404);
      return ok(c, row);
    });

    ctx.app.get(`${p}/admin/lab/experiments`, admin, async (c) => {
      if (!(await ctx.db.tableExists('lab_experiments'))) return fail(c, 'capability_unavailable', 409);
      const del = await notDeletedClause(ctx.db, 'lab_experiments');
      return ok(
        c,
        await ctx.db.all(`SELECT * FROM lab_experiments WHERE 1=1${del} ORDER BY id DESC LIMIT 200`),
      );
    });

    ctx.app.get(`${p}/admin/lab/experiments/:id`, admin, async (c) => {
      if (!(await ctx.db.tableExists('lab_experiments'))) return fail(c, 'capability_unavailable', 409);
      const row = await ctx.db.one('SELECT * FROM lab_experiments WHERE id=?', [c.req.param('id')]);
      if (!row) return fail(c, 'Not found', 404);
      return ok(c, row);
    });

    ctx.app.post(`${p}/admin/lab/experiments`, admin, async (c) => {
      if (!(await ctx.db.tableExists('lab_experiments'))) return fail(c, 'capability_unavailable', 409);
      const body = await readJsonBody(c);
      if (body instanceof Response) return body;
      const name = String(body.name ?? '').trim();
      const slug = String(body.slug ?? name.toLowerCase().replace(/\s+/g, '-')).trim();
      if (!name || !slug) return fail(c, 'Validation failed', 422);
      await ctx.db.run(
        'INSERT INTO lab_experiments (name, slug, entry_key, status, is_public, noindex, render_mode, settings_json, content_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [
          name,
          slug,
          String(body.entry_key ?? 'starter'),
          String(body.status ?? 'draft'),
          body.is_public ? 1 : 0,
          body.noindex === false ? 0 : 1,
          String(body.render_mode ?? 'embedded'),
          body.settings_json ? JSON.stringify(body.settings_json) : null,
          body.content_json ? JSON.stringify(body.content_json) : null,
          nowSql(),
        ],
      );
      const id = await ctx.db.lastInsertId();
      return ok(c, await ctx.db.one('SELECT * FROM lab_experiments WHERE id=?', [id]), 201);
    });

    ctx.app.get(`${p}/admin/lab/entries`, admin, async (c) => ok(c, LAB_ENTRIES));

    ctx.app.put(`${p}/admin/lab/experiments/:id`, admin, async (c) => {
      if (!(await ctx.db.tableExists('lab_experiments'))) return fail(c, 'capability_unavailable', 409);
      const id = c.req.param('id');
      const row = await findExperiment(ctx.db, id, true);
      if (!row) return fail(c, 'Not found', 404);
      const body = await readJsonBody(c);
      if (body instanceof Response) return body;
      const entryKey = body.entry_key != null ? String(body.entry_key) : String(row.entry_key ?? 'starter');
      if (!isKnownEntry(entryKey)) return fail(c, 'Unknown experiment entry', 422, null, { code: 'unknown_entry' });
      await ctx.db.run(
        'UPDATE lab_experiments SET name=?, slug=?, entry_key=?, status=?, is_public=?, noindex=?, render_mode=?, settings_json=?, content_json=?, updated_at=? WHERE id=?',
        [
          String(body.name ?? row.name),
          String(body.slug ?? row.slug),
          entryKey,
          String(body.status ?? row.status ?? 'draft'),
          body.is_public === undefined ? row.is_public : body.is_public ? 1 : 0,
          body.noindex === undefined ? row.noindex : body.noindex === false ? 0 : 1,
          String(body.render_mode ?? row.render_mode ?? 'embedded'),
          body.settings_json !== undefined ? JSON.stringify(body.settings_json) : row.settings_json,
          body.content_json !== undefined ? JSON.stringify(body.content_json) : row.content_json,
          nowSql(),
          id,
        ],
      );
      return ok(c, await ctx.db.one('SELECT * FROM lab_experiments WHERE id=?', [id]));
    });

    ctx.app.delete(`${p}/admin/lab/experiments/:id`, admin, async (c) => {
      if (!(await ctx.db.tableExists('lab_experiments'))) return fail(c, 'capability_unavailable', 409);
      const id = c.req.param('id');
      const row = await findExperiment(ctx.db, id, true);
      if (!row) return fail(c, 'Not found', 404);
      const cols = await ctx.db.columns('lab_experiments');
      if (cols.includes('deleted_at')) {
        await ctx.db.run('UPDATE lab_experiments SET deleted_at=? WHERE id=?', [nowSql(), id]);
      } else {
        await ctx.db.run('DELETE FROM lab_experiments WHERE id=?', [id]);
      }
      return ok(c, { message: 'Deleted' });
    });

    ctx.app.post(`${p}/admin/lab/experiments/:id/restore`, admin, async (c) => {
      if (!(await ctx.db.tableExists('lab_experiments'))) return fail(c, 'capability_unavailable', 409);
      const id = c.req.param('id');
      const row = await ctx.db.one('SELECT * FROM lab_experiments WHERE id=?', [id]);
      if (!row) return fail(c, 'Not found', 404);
      const cols = await ctx.db.columns('lab_experiments');
      if (cols.includes('deleted_at')) {
        await ctx.db.run('UPDATE lab_experiments SET deleted_at=NULL, updated_at=? WHERE id=?', [nowSql(), id]);
      }
      return ok(c, await ctx.db.one('SELECT * FROM lab_experiments WHERE id=?', [id]));
    });

    ctx.app.post(`${p}/admin/lab/experiments/:id/activate`, admin, async (c) => {
      const row = await setStatus(ctx.db, c.req.param('id'), 'active');
      if (!row) return fail(c, 'Not found', 404);
      return ok(c, row);
    });

    ctx.app.post(`${p}/admin/lab/experiments/:id/disable`, admin, async (c) => {
      const row = await setStatus(ctx.db, c.req.param('id'), 'disabled');
      if (!row) return fail(c, 'Not found', 404);
      return ok(c, row);
    });

    ctx.app.post(`${p}/admin/lab/experiments/:id/archive`, admin, async (c) => {
      const row = await setStatus(ctx.db, c.req.param('id'), 'archived');
      if (!row) return fail(c, 'Not found', 404);
      return ok(c, row);
    });

    ctx.app.post(`${p}/admin/lab/experiments/:id/duplicate`, admin, async (c) => {
      if (!(await ctx.db.tableExists('lab_experiments'))) return fail(c, 'capability_unavailable', 409);
      const src = await findExperiment(ctx.db, c.req.param('id'), true);
      if (!src) return fail(c, 'Not found', 404);
      const slug = `${String(src.slug)}-copy-${Date.now().toString(36)}`;
      await ctx.db.run(
        'INSERT INTO lab_experiments (name, slug, entry_key, status, is_public, noindex, render_mode, settings_json, content_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [
          `${src.name} (copy)`,
          slug,
          src.entry_key ?? 'starter',
          'draft',
          0,
          src.noindex ?? 1,
          src.render_mode ?? 'embedded',
          src.settings_json ?? null,
          src.content_json ?? null,
          nowSql(),
        ],
      );
      const id = await ctx.db.lastInsertId();
      return ok(c, await ctx.db.one('SELECT * FROM lab_experiments WHERE id=?', [id]), 201);
    });

    ctx.app.post(`${p}/admin/lab/experiments/:id/reset-content`, admin, async (c) => {
      if (!(await ctx.db.tableExists('lab_experiments'))) return fail(c, 'capability_unavailable', 409);
      const id = c.req.param('id');
      const row = await findExperiment(ctx.db, id, true);
      if (!row) return fail(c, 'Not found', 404);
      await ctx.db.run('UPDATE lab_experiments SET content_json=NULL, updated_at=? WHERE id=?', [nowSql(), id]);
      return ok(c, await ctx.db.one('SELECT * FROM lab_experiments WHERE id=?', [id]));
    });

    ctx.app.get(`${p}/admin/lab/experiments/:id/preview`, admin, async (c) => {
      const row = await findExperiment(ctx.db, c.req.param('id'));
      if (!row) return fail(c, 'Not found', 404);
      if (!isKnownEntry(String(row.entry_key ?? ''))) {
        return fail(c, 'Unknown experiment entry', 422, null, { code: 'unknown_entry' });
      }
      return ok(c, { ...row, preview: true });
    });
  }
}
