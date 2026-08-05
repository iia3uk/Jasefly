import type { ModuleContext } from '../core/types.js';
import { requireAdmin } from '../core/authMiddleware.js';
import { fail, ok } from '../http/envelope.js';
import { moduleSettings, readJsonBody, saveModuleSettings } from './_helpers.js';

export const name = 'ddos';

const DEFAULT_PROVIDERS = [
  { id: 'cloudflare', label: 'Cloudflare', enabled: false },
  { id: 'ddos_guard', label: 'DDoS-Guard', enabled: false },
  { id: 'stormwall', label: 'StormWall', enabled: false },
  { id: 'qrator', label: 'Qrator', enabled: false },
];

export async function register(ctx: ModuleContext) {
  const admin = requireAdmin(ctx.auth);

  for (const p of ctx.apiPrefixes) {
    ctx.app.get(`${p}/admin/ddos/status`, admin, async (c) => {
      const settings = await moduleSettings(ctx.db, 'ddos');
      const providers = DEFAULT_PROVIDERS.map((prov) => ({
        ...prov,
        enabled: Boolean(settings[`enable_${prov.id}`]),
      }));
      return ok(c, {
        enabled: providers.some((x) => x.enabled),
        under_attack: Boolean(settings.under_attack),
        providers,
        runtime: ctx.cfg.runtime,
      });
    });

    ctx.app.get(`${p}/admin/ddos/providers`, admin, async (c) => {
      const settings = await moduleSettings(ctx.db, 'ddos');
      return ok(c, DEFAULT_PROVIDERS.map((prov) => ({
        ...prov,
        enabled: Boolean(settings[`enable_${prov.id}`]),
      })));
    });

    ctx.app.post(`${p}/admin/ddos/under-attack`, admin, async (c) => {
      const body = await readJsonBody(c);
      if (body instanceof Response) return body;
      const enabled = Boolean(body.enabled);
      const settings = await saveModuleSettings(ctx.db, 'ddos', { under_attack: enabled });
      return ok(c, { under_attack: enabled, status: settings, remote: { ok: true, skipped: true } });
    });

    ctx.app.post(`${p}/admin/ddos/providers/:id/toggle`, admin, async (c) => {
      const body = await readJsonBody(c);
      if (body instanceof Response) return body;
      const id = c.req.param('id');
      if (!DEFAULT_PROVIDERS.some((x) => x.id === id)) return fail(c, 'Unknown provider', 404);
      const settings = await saveModuleSettings(ctx.db, 'ddos', { [`enable_${id}`]: Boolean(body.enabled) });
      return ok(c, { id, enabled: Boolean(body.enabled), status: settings });
    });

    ctx.app.post(`${p}/admin/ddos/sync-cloudflare-ips`, admin, async (c) =>
      ok(c, { synced: false, message: 'Cloudflare IP sync not implemented in Node baseline' }),
    );
  }
}
