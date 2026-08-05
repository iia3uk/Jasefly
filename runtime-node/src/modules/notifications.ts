import type { ModuleContext } from '../core/types.js';
import { requireAdmin } from '../core/authMiddleware.js';
import { fail, ok } from '../http/envelope.js';
import { nowSql, readJsonBody } from './_helpers.js';

export const name = 'notifications';

function userId(c: { get: (k: 'user') => unknown }): number {
  const user = c.get('user') as { id?: number; sub?: number } | 'mcp' | null;
  if (!user || user === 'mcp') return 0;
  return Number(user.id ?? user.sub ?? 0);
}

export async function register(ctx: ModuleContext) {
  const admin = requireAdmin(ctx.auth);

  for (const p of ctx.apiPrefixes) {
    ctx.app.get(`${p}/admin/notifications`, admin, async (c) => {
      if (!(await ctx.db.tableExists('notifications'))) return ok(c, []);
      const uid = userId(c);
      const onlyUnread = c.req.query('unread') === '1';
      let sql = 'SELECT * FROM notifications WHERE (user_id=? OR user_id IS NULL)';
      if (onlyUnread) sql += ' AND is_read=0';
      sql += ' ORDER BY id DESC LIMIT 200';
      return ok(c, await ctx.db.all(sql, [uid]));
    });

    ctx.app.get(`${p}/admin/notifications/unread-count`, admin, async (c) => {
      if (!(await ctx.db.tableExists('notifications'))) return ok(c, { count: 0 });
      const uid = userId(c);
      const row = await ctx.db.one(
        'SELECT COUNT(*) AS c FROM notifications WHERE is_read=0 AND (user_id=? OR user_id IS NULL)',
        [uid],
      );
      return ok(c, { count: Number(row?.c ?? 0) });
    });

    ctx.app.post(`${p}/admin/notifications/:id/read`, admin, async (c) => {
      if (!(await ctx.db.tableExists('notifications'))) return fail(c, 'capability_unavailable', 409);
      const uid = userId(c);
      const id = c.req.param('id');
      const row = await ctx.db.one('SELECT * FROM notifications WHERE id=? AND (user_id=? OR user_id IS NULL)', [
        id,
        uid,
      ]);
      if (!row) return fail(c, 'Not found', 404);
      await ctx.db.run('UPDATE notifications SET is_read=1 WHERE id=?', [id]);
      return ok(c, { ok: true });
    });

    ctx.app.post(`${p}/admin/notifications/read-all`, admin, async (c) => {
      if (!(await ctx.db.tableExists('notifications'))) return fail(c, 'capability_unavailable', 409);
      const uid = userId(c);
      await ctx.db.run('UPDATE notifications SET is_read=1 WHERE is_read=0 AND (user_id=? OR user_id IS NULL)', [uid]);
      return ok(c, { ok: true });
    });

    ctx.app.post(`${p}/admin/notifications/test`, admin, async (c) => {
      if (!(await ctx.db.tableExists('notifications'))) return fail(c, 'capability_unavailable', 409);
      const body = await readJsonBody(c);
      if (body instanceof Response) return body;
      const title = String(body.title ?? 'Тестовое уведомление');
      const text = String(body.body ?? 'Канал уведомлений работает.');
      await ctx.db.run(
        'INSERT INTO notifications (user_id, type, title, body, action_url, priority, is_read, created_at) VALUES (NULL, ?, ?, ?, ?, ?, 0, ?)',
        ['system.test', title, text, '/admin/notifications', 'normal', nowSql()],
      );
      const id = await ctx.db.lastInsertId();
      return ok(c, { id, ok: true });
    });

    ctx.app.get(`${p}/admin/notification-templates`, admin, async (c) => {
      if (!(await ctx.db.tableExists('notification_templates'))) return ok(c, []);
      return ok(c, await ctx.db.all('SELECT * FROM notification_templates ORDER BY id DESC'));
    });

    ctx.app.post(`${p}/admin/notification-templates`, admin, async (c) => {
      if (!(await ctx.db.tableExists('notification_templates'))) return fail(c, 'capability_unavailable', 409);
      const body = await readJsonBody(c);
      if (body instanceof Response) return body;
      await ctx.db.run(
        'INSERT INTO notification_templates (type, channel, subject, body, is_active, created_at) VALUES (?, ?, ?, ?, ?, ?)',
        [
          String(body.type ?? 'generic'),
          String(body.channel ?? 'browser'),
          body.subject ?? null,
          String(body.body ?? ''),
          body.is_active === false ? 0 : 1,
          nowSql(),
        ],
      );
      const id = await ctx.db.lastInsertId();
      return ok(c, { id }, 201);
    });

    ctx.app.put(`${p}/admin/notification-templates/:id`, admin, async (c) => {
      if (!(await ctx.db.tableExists('notification_templates'))) return fail(c, 'capability_unavailable', 409);
      const id = c.req.param('id');
      const existing = await ctx.db.one('SELECT * FROM notification_templates WHERE id=?', [id]);
      if (!existing) return fail(c, 'Not found', 404);
      const body = await readJsonBody(c);
      if (body instanceof Response) return body;
      await ctx.db.run(
        'UPDATE notification_templates SET type=?, channel=?, subject=?, body=?, is_active=? WHERE id=?',
        [
          String(body.type ?? existing.type),
          String(body.channel ?? existing.channel),
          body.subject ?? existing.subject,
          String(body.body ?? existing.body),
          body.is_active === undefined ? existing.is_active : body.is_active ? 1 : 0,
          id,
        ],
      );
      return ok(c, await ctx.db.one('SELECT * FROM notification_templates WHERE id=?', [id]));
    });

    ctx.app.delete(`${p}/admin/notification-templates/:id`, admin, async (c) => {
      if (!(await ctx.db.tableExists('notification_templates'))) return fail(c, 'capability_unavailable', 409);
      await ctx.db.run('DELETE FROM notification_templates WHERE id=?', [c.req.param('id')]);
      return ok(c, { ok: true });
    });
  }
}
