import type { Context } from 'hono';
import crypto from 'node:crypto';
import type { ModuleContext } from '../core/types.js';
import { requireAdmin } from '../core/authMiddleware.js';
import { fail, ok } from '../http/envelope.js';
import { nowSql, readJsonBody } from './_helpers.js';

export const name = 'analytics';

function visitorHash(c: Context): string {
  const ip = c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ?? '0.0.0.0';
  const ua = c.req.header('user-agent') ?? '';
  return crypto.createHash('sha256').update(`${ip}|${ua}`).digest('hex');
}

export async function register(ctx: ModuleContext) {
  const admin = requireAdmin(ctx.auth);

  for (const p of ctx.apiPrefixes) {
    ctx.app.post(`${p}/analytics/collect`, async (c) => {
      if (!(await ctx.db.tableExists('analytics_events'))) return fail(c, 'capability_unavailable', 409);

      if (await ctx.db.tableExists('analytics_settings')) {
        const settings = await ctx.db.one('SELECT respect_dnt FROM analytics_settings WHERE id=1');
        if (Number(settings?.respect_dnt ?? 1) === 1 && c.req.header('dnt') === '1') {
          return ok(c, { accepted: false, reason: 'dnt' });
        }
      }

      const body = await readJsonBody(c);
      if (body instanceof Response) return body;
      const ALLOWED = [
        'page_view',
        'form_view',
        'form_submit',
        'form_success',
        'checkout_started',
        'order_created',
        'payment_completed',
        'comment_created',
        'newsletter_subscribed',
        'custom_event',
      ];
      const eventName = String(body.event ?? body.event_name ?? body.name ?? '')
        .toLowerCase()
        .trim()
        .slice(0, 64);
      // PHP AnalyticsService::ingest — unknown/empty event → 422
      if (!ALLOWED.includes(eventName)) return fail(c, 'Unsupported analytics event', 422);
      const vHash = visitorHash(c);
      const cols = await ctx.db.columns('analytics_events');
      const data: Record<string, unknown> = {};
      if (cols.includes('event_name')) data.event_name = eventName;
      else if (cols.includes('name')) data.name = eventName;
      if (cols.includes('visitor_hash')) data.visitor_hash = vHash;
      if (cols.includes('path')) data.path = String(body.path ?? c.req.path).slice(0, 1024);
      if (cols.includes('target_type') && body.target_type) data.target_type = String(body.target_type);
      if (cols.includes('target_id') && body.target_id) data.target_id = String(body.target_id);
      if (cols.includes('value') && body.value != null) data.value = Number(body.value);
      if (cols.includes('metadata')) data.metadata = JSON.stringify(body);
      else if (cols.includes('payload')) data.payload = JSON.stringify(body);
      if (cols.includes('created_at')) data.created_at = nowSql();

      const keys = Object.keys(data);
      await ctx.db.run(
        `INSERT INTO analytics_events (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`,
        keys.map((k) => data[k]),
      );
      return ok(c, { accepted: true, event: eventName }, 202);
    });

    ctx.app.get(`${p}/admin/analytics/overview`, admin, async (c) => {
      if (!(await ctx.db.tableExists('analytics_events'))) {
        return ok(c, { events_total: 0, events_today: 0, top_events: [] });
      }
      const totalRow = await ctx.db.one('SELECT COUNT(*) AS c FROM analytics_events');
      const today = nowSql().slice(0, 10);
      const todayRow = await ctx.db.one('SELECT COUNT(*) AS c FROM analytics_events WHERE created_at >= ?', [
        `${today} 00:00:00`,
      ]);
      const cols = await ctx.db.columns('analytics_events');
      const nameCol = cols.includes('event_name') ? 'event_name' : 'name';
      const top = await ctx.db.all(
        `SELECT ${nameCol} AS event_name, COUNT(*) AS c FROM analytics_events GROUP BY ${nameCol} ORDER BY c DESC LIMIT 10`,
      );
      return ok(c, {
        events_total: Number(totalRow?.c ?? 0),
        events_today: Number(todayRow?.c ?? 0),
        top_events: top,
      });
    });

    ctx.app.get(`${p}/admin/analytics/goals`, admin, async (c) => {
      if (!(await ctx.db.tableExists('analytics_goals'))) return ok(c, []);
      return ok(c, await ctx.db.all('SELECT * FROM analytics_goals ORDER BY id DESC'));
    });

    ctx.app.post(`${p}/admin/analytics/goals`, admin, async (c) => {
      if (!(await ctx.db.tableExists('analytics_goals'))) return fail(c, 'capability_unavailable', 409);
      const body = await readJsonBody(c);
      if (body instanceof Response) return body;
      const eventName = String(body.event_name ?? body.name ?? '').slice(0, 64);
      if (!eventName) return fail(c, 'Validation failed', 422);
      await ctx.db.run(
        'INSERT INTO analytics_goals (name, event_name, conditions, value, is_active, created_at) VALUES (?, ?, ?, ?, ?, ?)',
        [
          String(body.name ?? 'Goal'),
          eventName,
          JSON.stringify(body.conditions ?? {}),
          body.value ?? null,
          body.is_active === false ? 0 : 1,
          nowSql(),
        ],
      );
      const id = await ctx.db.lastInsertId();
      return ok(c, await ctx.db.one('SELECT * FROM analytics_goals WHERE id=?', [id]), 201);
    });

    ctx.app.delete(`${p}/admin/analytics/goals/:id`, admin, async (c) => {
      if (!(await ctx.db.tableExists('analytics_goals'))) return fail(c, 'capability_unavailable', 409);
      await ctx.db.run('DELETE FROM analytics_goals WHERE id=?', [c.req.param('id')]);
      return ok(c, { ok: true });
    });

    ctx.app.post(`${p}/admin/analytics/aggregate`, admin, async (c) => {
      if (!(await ctx.db.tableExists('analytics_events'))) return fail(c, 'capability_unavailable', 409);
      const body = await readJsonBody(c);
      if (body instanceof Response) return body;
      const from = String(body.from ?? new Date().toISOString().slice(0, 10));
      const to = String(body.to ?? from);
      if (!(await ctx.db.tableExists('analytics_daily_stats'))) {
        return ok(c, { rows: 0, message: 'analytics_daily_stats table missing' });
      }
      await ctx.db.run('DELETE FROM analytics_daily_stats WHERE stat_date BETWEEN ? AND ?', [from, to]).catch(() => undefined);
      const eventCols = await ctx.db.columns('analytics_events');
      const eventNameCol = eventCols.includes('event_name') ? 'event_name' : 'name';
      await ctx.db.run(
        `INSERT INTO analytics_daily_stats (stat_date, event_name, path, events_count, unique_visitors, value_total)
         SELECT substr(created_at, 1, 10), ${eventNameCol}, substr(COALESCE(path,''), 1, 512),
                COUNT(*), COUNT(DISTINCT visitor_hash), COALESCE(SUM(value), 0)
         FROM analytics_events WHERE created_at >= ? AND created_at < date(?, '+1 day')
         GROUP BY substr(created_at, 1, 10), ${eventNameCol}, substr(COALESCE(path,''), 1, 512)`,
        [from, to],
      ).catch(() => undefined);
      const row = await ctx.db.one('SELECT COUNT(*) AS c FROM analytics_daily_stats WHERE stat_date BETWEEN ? AND ?', [
        from,
        to,
      ]).catch(() => ({ c: 0 }));
      return ok(c, { rows: Number(row?.c ?? 0) });
    });
  }
}
