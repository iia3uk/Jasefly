import os from 'node:os';
import type { ModuleContext } from '../core/types.js';
import { requireAdmin } from '../core/authMiddleware.js';
import { fail, ok } from '../http/envelope.js';
import { moduleSettings, saveModuleSettings } from './_helpers.js';

export const name = 'overload';

/** Match PHP_OS_FAMILY (Windows|Linux|Darwin|…). */
function phpOsFamily(): string {
  if (process.platform === 'win32') return 'Windows';
  if (process.platform === 'darwin') return 'Darwin';
  if (process.platform === 'linux') return 'Linux';
  return process.platform;
}

function buildStatus(
  settings: Record<string, unknown>,
  sample: { 1: number; 5: number; 15: number } | null,
  cpus: number,
) {
  const threshold1 = Number(settings.threshold_1m ?? 2.5);
  const threshold5 = Number(settings.threshold_5m ?? 0);
  const normalizeByCpu = settings.normalize_by_cpu !== false;
  const requireSustained = settings.require_sustained !== false;
  const cpuN = Math.max(1, cpus);
  const abs1 = normalizeByCpu ? threshold1 * cpuN : threshold1;
  const abs5 = threshold5 > 0 ? (normalizeByCpu ? threshold5 * cpuN : threshold5) : 0;
  const perCore =
    sample && cpuN > 0
      ? {
          1: Math.round((sample[1] / cpuN) * 100) / 100,
          5: Math.round((sample[5] / cpuN) * 100) / 100,
          15: Math.round((sample[15] / cpuN) * 100) / 100,
        }
      : null;
  const overloaded =
    sample !== null &&
    (requireSustained
      ? sample[1] >= abs1 && sample[5] >= (abs5 > 0 ? abs5 : abs1 * 0.75)
      : sample[1] >= abs1);

  return {
    available: sample !== null,
    platform: phpOsFamily(),
    cpus: cpuN,
    normalize_by_cpu: normalizeByCpu,
    require_sustained: requireSustained,
    load: sample,
    load_per_core: perCore,
    threshold_1m: threshold1,
    threshold_5m: threshold5,
    threshold_1m_absolute: abs1,
    threshold_5m_absolute: abs5 > 0 ? abs5 : requireSustained ? Math.round(abs1 * 0.75 * 100) / 100 : 0,
    mode: String(settings.mode ?? 'log'),
    overloaded: sample !== null ? overloaded : false,
    quiet_until: null as number | null,
    tripped: false,
    last_trip_at: null as string | null,
    last_notify_at: null as string | null,
    retry_after: Number(settings.retry_after ?? 30),
    // Match OverloadModule settings default when DB row has no error_message.
    error_message:
      String(settings.error_message ?? '') ||
      'Сайт временно недоступен из‑за высокой нагрузки на сервер. Попробуйте позже.',
    stats: { total: 0, last_24h: 0, closed_24h: 0 },
    events: [] as unknown[],
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
      const sample =
        process.platform === 'win32'
          ? null
          : (() => {
              const avg = os.loadavg();
              return {
                1: Math.round(avg[0] * 100) / 100,
                5: Math.round(avg[1] * 100) / 100,
                15: Math.round(avg[2] * 100) / 100,
              };
            })();
      const cpus = process.platform === 'win32' ? 1 : os.cpus().length || 1;
      const status = buildStatus(settings, sample, cpus);
      if (await ctx.db.tableExists('overload_events')) {
        const row = await ctx.db.one('SELECT COUNT(*) AS c FROM overload_events');
        status.stats.total = Number(row?.c ?? 0);
      }
      return ok(c, status);
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
