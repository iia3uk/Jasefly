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

import crypto from 'node:crypto';


function visitorHash(c: Context): string {
  const ip = c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ?? '0.0.0.0';
  const ua = c.req.header('user-agent') ?? '';
  return crypto.createHash('sha256').update(`${ip}|${ua}`).digest('hex');
}

export async function register(ctx: PlatformContext) {
  const http = ctx.http();
  const db = ctx.database();
  const events = ctx.events();
  const jobs = ctx.jobs();

  jobs.registerHandler('analytics.retention', async (payload) => {
    if (!(await db.tableExists('analytics_events'))) return;
    const days = Math.max(1, Number(payload.days ?? payload.retention_days ?? 90));
    const cutoff = new Date(Date.now() - days * 86400000).toISOString().slice(0, 19).replace('T', ' ');
    const cols = await db.columns('analytics_events');
    if (!cols.includes('created_at')) return;
    await db.run('DELETE FROM analytics_events WHERE created_at < ?', [cutoff]).catch(() => undefined);
  });

  jobs.registerHandler('analytics.aggregate', async (payload) => {
    if (!(await db.tableExists('analytics_events'))) return;
    if (!(await db.tableExists('analytics_daily_stats'))) return;
    const day = String(payload.date ?? new Date().toISOString().slice(0, 10));
    const rows = await db.all(
      "SELECT COUNT(*) AS c FROM analytics_events WHERE substr(created_at,1,10)=?",
      [day],
    ).catch(() => []);
    const count = Number(rows?.[0]?.c ?? 0);
    await db.run(
      "INSERT INTO analytics_daily_stats (stat_date, event_count) VALUES (?, ?) ON CONFLICT(stat_date) DO UPDATE SET event_count=excluded.event_count",
      [day, count],
    ).catch(() => undefined);
    await events.publish('analytics.aggregated', { date: day, event_count: count });
  });
  const admin = http.admin();
  const crud = ctx.adminResources();
  void admin;
  void crud;


    http.post('/analytics/collect', async (c) => {
      if (!(await db.tableExists('analytics_events'))) return http.fail(c, 'capability_unavailable', 409);

      if (await db.tableExists('analytics_settings')) {
        const settings = await db.one('SELECT respect_dnt FROM analytics_settings WHERE id=1');
        if (Number(settings?.respect_dnt ?? 1) === 1 && c.req.header('dnt') === '1') {
          return http.ok(c, { accepted: false, reason: 'dnt' });
        }
      }

      const body = await readJsonBody(c, http.fail);
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
      if (!ALLOWED.includes(eventName)) return http.fail(c, 'Unsupported analytics event', 422);
      const vHash = visitorHash(c);
      const cols = await db.columns('analytics_events');
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
      await db.run(
        `INSERT INTO analytics_events (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`,
        keys.map((k) => data[k]),
      );
      return http.ok(c, { accepted: true, event: eventName }, 202);
    });

    http.get('/admin/analytics/overview', admin, async (c) => {
      // PHP AnalyticsService::overview shape
      const to = String(c.req.query('to') ?? new Date().toISOString().slice(0, 10));
      const fromDefault = new Date(Date.now() - 29 * 86400000).toISOString().slice(0, 10);
      let from = String(c.req.query('from') ?? fromDefault);
      let toDate = to;
      let fromDate = from;
      if (fromDate > toDate) [fromDate, toDate] = [toDate, fromDate];
      const empty = {
        range: { from: fromDate, to: toDate },
        summary: { events: 0, visitors: 0, sessions: 0, page_views: null, value_total: 0 },
        daily: [] as unknown[],
        events: [] as unknown[],
        pages: [] as unknown[],
        goals: [] as unknown[],
      };
      if (!(await db.tableExists('analytics_events'))) return http.ok(c, empty);

      const toExclusive = `${toDate} 23:59:59`;
      const fromStart = `${fromDate} 00:00:00`;
      const summary =
        (await db.one(
          `SELECT COUNT(*) AS events,
                  COUNT(DISTINCT visitor_hash) AS visitors,
                  COUNT(DISTINCT session_id) AS sessions,
                  SUM(CASE WHEN event_name='page_view' THEN 1 ELSE 0 END) AS page_views,
                  COALESCE(SUM(value),0) AS value_total
           FROM analytics_events WHERE created_at>=? AND created_at<=?`,
          [fromStart, toExclusive],
        )) ?? {};
      const daily = await db.all(
        `SELECT substr(created_at,1,10) AS date, COUNT(*) AS events,
                COUNT(DISTINCT visitor_hash) AS visitors,
                SUM(CASE WHEN event_name='page_view' THEN 1 ELSE 0 END) AS page_views
         FROM analytics_events WHERE created_at>=? AND created_at<=?
         GROUP BY substr(created_at,1,10) ORDER BY date`,
        [fromStart, toExclusive],
      );
      const events = await db.all(
        `SELECT event_name, COUNT(*) AS count, COUNT(DISTINCT visitor_hash) AS visitors,
                COALESCE(SUM(value),0) AS value
         FROM analytics_events WHERE created_at>=? AND created_at<=?
         GROUP BY event_name ORDER BY count DESC`,
        [fromStart, toExclusive],
      );
      const pages = await db.all(
        `SELECT path, COUNT(*) AS views, COUNT(DISTINCT visitor_hash) AS visitors
         FROM analytics_events WHERE event_name='page_view' AND created_at>=? AND created_at<=?
         GROUP BY path ORDER BY views DESC LIMIT 50`,
        [fromStart, toExclusive],
      );
      let goals: unknown[] = [];
      if (await db.tableExists('analytics_goals')) {
        try {
          goals = await db.all(
            `SELECT g.id, g.name, COUNT(c.id) AS conversions, COALESCE(SUM(c.value),0) AS value
             FROM analytics_goals g
             LEFT JOIN analytics_goal_conversions c ON c.goal_id=g.id
               AND c.created_at>=? AND c.created_at<=?
             WHERE g.is_active=1 GROUP BY g.id, g.name ORDER BY conversions DESC`,
            [fromStart, toExclusive],
          );
        } catch {
          goals = [];
        }
      }
      return http.ok(c, {
        range: { from: fromDate, to: toDate },
        summary: {
          events: Number(summary.events ?? 0),
          visitors: Number(summary.visitors ?? 0),
          sessions: Number(summary.sessions ?? 0),
          page_views: summary.page_views == null ? null : Number(summary.page_views),
          value_total: Number(summary.value_total ?? 0),
        },
        daily,
        events,
        pages,
        goals,
      });
    });

    http.get('/admin/analytics/goals', admin, async (c) => {
      if (!(await db.tableExists('analytics_goals'))) return http.ok(c, []);
      return http.ok(c, await db.all('SELECT * FROM analytics_goals ORDER BY id DESC'));
    });

    http.post('/admin/analytics/goals', admin, async (c) => {
      if (!(await db.tableExists('analytics_goals'))) return http.fail(c, 'capability_unavailable', 409);
      const body = await readJsonBody(c, http.fail);
      if (body instanceof Response) return body;
      const eventName = String(body.event_name ?? body.name ?? '').slice(0, 64);
      if (!eventName) return http.fail(c, 'Validation failed', 422);
      await db.run(
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
      const id = await db.lastInsertId();
      return http.ok(c, await db.one('SELECT * FROM analytics_goals WHERE id=?', [id]), 201);
    });

    http.delete('/admin/analytics/goals/:id', admin, async (c) => {
      if (!(await db.tableExists('analytics_goals'))) return http.fail(c, 'capability_unavailable', 409);
      await db.run('DELETE FROM analytics_goals WHERE id=?', [c.req.param('id')]);
      return http.ok(c, { ok: true });
    });

    http.post('/admin/analytics/aggregate', admin, async (c) => {
      if (!(await db.tableExists('analytics_events'))) return http.fail(c, 'capability_unavailable', 409);
      const body = await readJsonBody(c, http.fail);
      if (body instanceof Response) return body;
      const from = String(body.from ?? new Date().toISOString().slice(0, 10));
      const to = String(body.to ?? from);
      if (!(await db.tableExists('analytics_daily_stats'))) {
        return http.ok(c, { rows: 0, message: 'analytics_daily_stats table missing' });
      }
      await db.run('DELETE FROM analytics_daily_stats WHERE stat_date BETWEEN ? AND ?', [from, to]).catch(() => undefined);
      const eventCols = await db.columns('analytics_events');
      const eventNameCol = eventCols.includes('event_name') ? 'event_name' : 'name';
      await db.run(
        `INSERT INTO analytics_daily_stats (stat_date, event_name, path, events_count, unique_visitors, value_total)
         SELECT substr(created_at, 1, 10), ${eventNameCol}, substr(COALESCE(path,''), 1, 512),
                COUNT(*), COUNT(DISTINCT visitor_hash), COALESCE(SUM(value), 0)
         FROM analytics_events WHERE created_at >= ? AND created_at < date(?, '+1 day')
         GROUP BY substr(created_at, 1, 10), ${eventNameCol}, substr(COALESCE(path,''), 1, 512)`,
        [from, to],
      ).catch(() => undefined);
      const row = await db.one('SELECT COUNT(*) AS c FROM analytics_daily_stats WHERE stat_date BETWEEN ? AND ?', [
        from,
        to,
      ]).catch(() => ({ c: 0 }));
      return http.ok(c, { rows: Number(row?.c ?? 0) });
    });
  
}
