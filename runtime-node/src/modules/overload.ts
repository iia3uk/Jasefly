import os from 'node:os';
import type { ModuleContext } from '../core/types.js';
import { requireAdmin } from '../core/authMiddleware.js';
import { fail, ok } from '../http/envelope.js';
import { moduleSettings, saveModuleSettings } from './_helpers.js';

export const name = 'overload';

export async function register(ctx: ModuleContext) {
  const admin = requireAdmin(ctx.auth);

  for (const p of ctx.apiPrefixes) {
    ctx.app.get(`${p}/admin/overload/status`, admin, async (c) => {
      const settings = await moduleSettings(ctx.db, 'overload');
      const load = os.loadavg();
      const cpus = os.cpus().length || 1;
      const threshold = Number(settings.threshold_1m ?? 2.5);
      const perCpu = load[0] / cpus;
      let recentEvents = 0;
      if (await ctx.db.tableExists('overload_events')) {
        const row = await ctx.db.one('SELECT COUNT(*) AS c FROM overload_events');
        recentEvents = Number(row?.c ?? 0);
      }
      return ok(c, {
        load: { '1m': load[0], '5m': load[1], '15m': load[2] },
        cpus,
        per_cpu: perCpu,
        threshold,
        normalize_by_cpu: settings.normalize_by_cpu !== false,
        mode: String(settings.mode ?? 'log'),
        tripped: perCpu >= threshold,
        events_total: recentEvents,
        runtime: ctx.cfg.runtime,
      });
    });

    ctx.app.post(`${p}/admin/overload/test-notify`, admin, async (c) =>
      ok(c, { sent: false, message: 'Email notify skipped in Node baseline' }),
    );

    ctx.app.post(`${p}/admin/overload/clear-events`, admin, async (c) => {
      if (!(await ctx.db.tableExists('overload_events'))) return ok(c, { cleared: true, count: 0 });
      const row = await ctx.db.one('SELECT COUNT(*) AS c FROM overload_events');
      await ctx.db.run('DELETE FROM overload_events');
      return ok(c, { cleared: true, count: Number(row?.c ?? 0) });
    });

    ctx.app.put(`${p}/admin/overload/settings`, admin, async (c) => {
      const body = await c.req.json().catch(() => null);
      if (!body || typeof body !== 'object') return fail(c, 'Validation failed', 422);
      const settings = await saveModuleSettings(ctx.db, 'overload', body as Record<string, unknown>);
      return ok(c, settings);
    });
  }
}
