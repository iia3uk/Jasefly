import os from 'node:os';
import type { ModuleContext } from '../core/types.js';
import { requireAdmin } from '../core/authMiddleware.js';
import { fail, ok } from '../http/envelope.js';
import { moduleSettings, saveModuleSettings } from './_helpers.js';

export const name = 'overload';

function windowsUnavailableStatus(settings: Record<string, unknown>) {
  const threshold1 = Number(settings.threshold_1m ?? 2.5);
  const threshold5 = Number(settings.threshold_5m ?? 0);
  const cpus = 1; // PHP reports 1 when loadavg unavailable on Windows
  const abs1 = threshold1 * cpus;
  const requireSustained = settings.require_sustained !== false;
  return {
    available: false,
    platform: 'Windows',
    cpus,
    normalize_by_cpu: settings.normalize_by_cpu !== false,
    require_sustained: requireSustained,
    load: null,
    load_per_core: null,
    threshold_1m: threshold1,
    threshold_5m: threshold5,
    threshold_1m_absolute: abs1,
    threshold_5m_absolute: threshold5 > 0 ? threshold5 * cpus : requireSustained ? Math.round(abs1 * 0.75 * 100) / 100 : 0,
    mode: String(settings.mode ?? 'log'),
    overloaded: false,
    quiet_until: null,
    tripped: false,
    last_trip_at: null,
    last_notify_at: null,
    retry_after: Number(settings.retry_after ?? 30),
    error_message:
      String(settings.error_message ?? '') ||
      'Сайт временно недоступен из‑за высокой нагрузки на сервер. Попробуйте позже.',
    stats: { total: 0, last_24h: 0, closed_24h: 0 },
    events: [],
    hint:
      'sys_getloadavg на shared — нагрузка всего хоста (соседи + ваш аккаунт). ' +
      'Порог считается на ядро; краткие всплески при MCP/ZIP-апдейте глушатся окном тишины.',
  };
}

export async function register(ctx: ModuleContext) {
  const admin = requireAdmin(ctx.auth);

  for (const p of ctx.apiPrefixes) {
    ctx.app.get(`${p}/admin/overload/status`, admin, async (c) => {
      const settings = await moduleSettings(ctx.db, 'overload');
      // Match PHP OverloadService fail-open when sys_getloadavg is unavailable (Windows).
      if (process.platform === 'win32') {
        const status = windowsUnavailableStatus(settings);
        if (await ctx.db.tableExists('overload_events')) {
          const row = await ctx.db.one('SELECT COUNT(*) AS c FROM overload_events');
          status.stats.total = Number(row?.c ?? 0);
        }
        return ok(c, status);
      }

      const loadAvg = os.loadavg();
      const cpus = os.cpus().length || 1;
      const threshold = Number(settings.threshold_1m ?? 2.5);
      const perCpu = loadAvg[0] / cpus;
      let recentEvents = 0;
      if (await ctx.db.tableExists('overload_events')) {
        const row = await ctx.db.one('SELECT COUNT(*) AS c FROM overload_events');
        recentEvents = Number(row?.c ?? 0);
      }
      return ok(c, {
        available: true,
        platform: process.platform,
        load: { 1: loadAvg[0], 5: loadAvg[1], 15: loadAvg[2] },
        cpus,
        load_per_core: {
          1: Math.round((loadAvg[0] / cpus) * 100) / 100,
          5: Math.round((loadAvg[1] / cpus) * 100) / 100,
          15: Math.round((loadAvg[2] / cpus) * 100) / 100,
        },
        threshold_1m: threshold,
        normalize_by_cpu: settings.normalize_by_cpu !== false,
        mode: String(settings.mode ?? 'log'),
        tripped: perCpu >= threshold,
        events_total: recentEvents,
        stats: { total: recentEvents, last_24h: 0, closed_24h: 0 },
        events: [],
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
