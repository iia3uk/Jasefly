import crypto from 'node:crypto';
import type { ModuleContext } from '../core/types.js';
import { requireAdmin } from '../core/authMiddleware.js';
import { fail, ok } from '../http/envelope.js';
import { notDeletedClause, nowSql, publicId, readJsonBody } from './_helpers.js';

export const name = 'comments';

export async function register(ctx: ModuleContext) {
  const admin = requireAdmin(ctx.auth);

  for (const p of ctx.apiPrefixes) {
    ctx.app.get(`${p}/comments`, async (c) => {
      if (!(await ctx.db.tableExists('comments'))) return fail(c, 'Not found', 404);
      const targetType = String(c.req.query('target_type') ?? '').trim();
      const targetId = Number(c.req.query('target_id') ?? 0);
      if (!targetType || !targetId) return fail(c, 'Validation failed', 422);
      const del = await notDeletedClause(ctx.db, 'comments');
      const type = String(c.req.query('type') ?? '').trim();
      let sql = `SELECT * FROM comments WHERE target_type=? AND target_id=? AND status='approved'${del}`;
      const params: unknown[] = [targetType, targetId];
      if (type === 'comment' || type === 'review') {
        sql += ' AND type=?';
        params.push(type);
      }
      sql += ' ORDER BY id ASC LIMIT 200';
      const items = await ctx.db.all(sql, params);
      const ratingRow = await ctx.db.one(
        `SELECT AVG(rating) AS avg_rating, COUNT(*) AS count FROM comments
         WHERE target_type=? AND target_id=? AND status='approved' AND rating IS NOT NULL${del}`,
        [targetType, targetId],
      );
      return ok(c, {
        items,
        rating: {
          average: Number(ratingRow?.avg_rating ?? 0),
          count: Number(ratingRow?.count ?? 0),
        },
      });
    });

    ctx.app.post(`${p}/comments`, async (c) => {
      if (!(await ctx.db.tableExists('comments'))) return fail(c, 'capability_unavailable', 409);
      const body = await readJsonBody(c);
      if (body instanceof Response) return body;

      const targetType = String(body.target_type ?? '').trim();
      const targetId = Number(body.target_id ?? 0);
      const text = String(body.body ?? '').trim();
      const authorName = String(body.author_name ?? body.name ?? '').trim();
      if (!targetType || !targetId || !text || !authorName) {
        return fail(c, 'Validation failed', 422);
      }

      const cols = await ctx.db.columns('comments');
      const data: Record<string, unknown> = {
        public_id: publicId(),
        type: String(body.type ?? 'comment'),
        target_type: targetType,
        target_id: targetId,
        author_name: authorName,
        body: text,
        status: 'pending',
        created_at: nowSql(),
      };
      if (cols.includes('author_email') && body.author_email) data.author_email = String(body.author_email);
      if (cols.includes('parent_id') && body.parent_id) data.parent_id = Number(body.parent_id);
      if (cols.includes('rating') && body.rating) data.rating = Number(body.rating);
      if (cols.includes('ip_hash')) {
        const ip = c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ?? '0.0.0.0';
        data.ip_hash = crypto.createHash('sha256').update(ip).digest('hex');
      }

      const keys = Object.keys(data);
      await ctx.db.run(
        `INSERT INTO comments (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`,
        keys.map((k) => data[k]),
      );
      const id = await ctx.db.lastInsertId();
      await ctx.events.publish('comment.created', { id, target_type: targetType, target_id: targetId });
      return ok(c, { id, public_id: data.public_id, status: 'pending' }, 201);
    });

    ctx.app.get(`${p}/admin/comments`, admin, async (c) => {
      if (!(await ctx.db.tableExists('comments'))) return ok(c, []);
      const status = String(c.req.query('status') ?? 'pending');
      const type = String(c.req.query('type') ?? '');
      const del = await notDeletedClause(ctx.db, 'comments');
      let sql = `SELECT * FROM comments WHERE 1=1${del}`;
      const params: unknown[] = [];
      if (status) {
        sql += ' AND status=?';
        params.push(status);
      }
      if (type === 'comment' || type === 'review') {
        sql += ' AND type=?';
        params.push(type);
      }
      sql += ' ORDER BY id DESC LIMIT 300';
      return ok(c, await ctx.db.all(sql, params));
    });

    ctx.app.post(`${p}/admin/comments/:id/moderate`, admin, async (c) => {
      if (!(await ctx.db.tableExists('comments'))) return fail(c, 'capability_unavailable', 409);
      const body = await readJsonBody(c);
      if (body instanceof Response) return body;
      const status = String(body.status ?? '').trim();
      if (!['approved', 'rejected', 'spam', 'pending'].includes(status)) {
        return fail(c, 'Validation failed', 422);
      }
      const id = c.req.param('id');
      const row = await ctx.db.one('SELECT * FROM comments WHERE id=?', [id]);
      if (!row) return fail(c, 'Not found', 404);
      await ctx.db.run('UPDATE comments SET status=?, updated_at=? WHERE id=?', [status, nowSql(), id]);
      await ctx.events.publish('comment.moderated', { id, status });
      return ok(c, await ctx.db.one('SELECT * FROM comments WHERE id=?', [id]));
    });

    ctx.app.delete(`${p}/admin/comments/:id`, admin, async (c) => {
      if (!(await ctx.db.tableExists('comments'))) return fail(c, 'capability_unavailable', 409);
      const id = c.req.param('id');
      const cols = await ctx.db.columns('comments');
      if (cols.includes('deleted_at')) {
        await ctx.db.run("UPDATE comments SET status='deleted', deleted_at=? WHERE id=?", [nowSql(), id]);
      } else {
        await ctx.db.run('DELETE FROM comments WHERE id=?', [id]);
      }
      return ok(c, { ok: true });
    });
  }
}
