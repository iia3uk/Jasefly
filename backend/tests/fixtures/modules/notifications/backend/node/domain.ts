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



function userId(c: { get: (k: 'user') => unknown }): number {
  const user = c.get('user') as { id?: number; sub?: number } | 'mcp' | null;
  if (!user || user === 'mcp') return 0;
  return Number(user.id ?? user.sub ?? 0);
}

export async function register(ctx: PlatformContext) {
  const http = ctx.http();
  const db = ctx.database();
  const events = ctx.events();
  const admin = http.admin();
  const crud = ctx.adminResources();
  void admin;
  void crud;


    http.get('/admin/notifications', admin, async (c) => {
      if (!(await db.tableExists('notifications'))) return http.ok(c, []);
      const uid = userId(c);
      const onlyUnread = c.req.query('unread') === '1';
      let sql = 'SELECT * FROM notifications WHERE (user_id=? OR user_id IS NULL)';
      if (onlyUnread) sql += ' AND is_read=0';
      sql += ' ORDER BY id DESC LIMIT 200';
      return http.ok(c, await db.all(sql, [uid]));
    });

    http.get('/admin/notifications/unread-count', admin, async (c) => {
      if (!(await db.tableExists('notifications'))) return http.ok(c, { count: 0 });
      const uid = userId(c);
      const row = await db.one(
        'SELECT COUNT(*) AS c FROM notifications WHERE is_read=0 AND (user_id=? OR user_id IS NULL)',
        [uid],
      );
      return http.ok(c, { count: Number(row?.c ?? 0) });
    });

    http.post('/admin/notifications/:id/read', admin, async (c) => {
      if (!(await db.tableExists('notifications'))) return http.fail(c, 'capability_unavailable', 409);
      const uid = userId(c);
      const id = c.req.param('id');
      const row = await db.one('SELECT * FROM notifications WHERE id=? AND (user_id=? OR user_id IS NULL)', [
        id,
        uid,
      ]);
      if (!row) return http.fail(c, 'Not found', 404);
      await db.run('UPDATE notifications SET is_read=1 WHERE id=?', [id]);
      return http.ok(c, { ok: true });
    });

    http.post('/admin/notifications/read-all', admin, async (c) => {
      if (!(await db.tableExists('notifications'))) return http.fail(c, 'capability_unavailable', 409);
      const uid = userId(c);
      await db.run('UPDATE notifications SET is_read=1 WHERE is_read=0 AND (user_id=? OR user_id IS NULL)', [uid]);
      return http.ok(c, { ok: true });
    });

    http.post('/admin/notifications/test', admin, async (c) => {
      if (!(await db.tableExists('notifications'))) return http.fail(c, 'capability_unavailable', 409);
      const body = await readJsonBody(c, http.fail);
      if (body instanceof Response) return body;
      const title = String(body.title ?? 'Тестовое уведомление');
      const text = String(body.body ?? 'Канал уведомлений работает.');
      await db.run(
        'INSERT INTO notifications (user_id, type, title, body, action_url, priority, is_read, created_at) VALUES (NULL, ?, ?, ?, ?, ?, 0, ?)',
        ['system.test', title, text, '/admin/notifications', 'normal', nowSql()],
      );
      const id = await db.lastInsertId();
      return http.ok(c, { id, ok: true });
    });

    http.get('/admin/notification-templates', admin, async (c) => {
      if (!(await db.tableExists('notification_templates'))) return http.ok(c, []);
      return http.ok(c, await db.all('SELECT * FROM notification_templates ORDER BY id DESC'));
    });

    http.post('/admin/notification-templates', admin, async (c) => {
      if (!(await db.tableExists('notification_templates'))) return http.fail(c, 'capability_unavailable', 409);
      const body = await readJsonBody(c, http.fail);
      if (body instanceof Response) return body;
      await db.run(
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
      const id = await db.lastInsertId();
      return http.ok(c, { id }, 201);
    });

    http.put('/admin/notification-templates/:id', admin, async (c) => {
      if (!(await db.tableExists('notification_templates'))) return http.fail(c, 'capability_unavailable', 409);
      const id = c.req.param('id');
      const existing = await db.one('SELECT * FROM notification_templates WHERE id=?', [id]);
      if (!existing) return http.fail(c, 'Not found', 404);
      const body = await readJsonBody(c, http.fail);
      if (body instanceof Response) return body;
      await db.run(
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
      return http.ok(c, await db.one('SELECT * FROM notification_templates WHERE id=?', [id]));
    });

    http.delete('/admin/notification-templates/:id', admin, async (c) => {
      if (!(await db.tableExists('notification_templates'))) return http.fail(c, 'capability_unavailable', 409);
      await db.run('DELETE FROM notification_templates WHERE id=?', [c.req.param('id')]);
      return http.ok(c, { ok: true });
    });
  
}
