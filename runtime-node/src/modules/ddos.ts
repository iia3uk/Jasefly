import type { ModuleContext } from '../core/types.js';
import { requireAdmin } from '../core/authMiddleware.js';
import { fail, ok } from '../http/envelope.js';
import { moduleSettings, readJsonBody, saveModuleSettings } from './_helpers.js';

export const name = 'ddos';

/** Match PHP ProviderCatalog status() with builtin edge CIDR counts. */
const PROVIDERS = [
  { id: 'cloudflare', label: 'Cloudflare', cidrs: 22, configured: true },
  { id: 'ddosguard', label: 'DDoS-Guard', cidrs: 5, configured: true },
  { id: 'stormwall', label: 'StormWall', cidrs: 3, configured: true },
  { id: 'qrator', label: 'Qrator Labs', cidrs: 0, configured: true },
] as const;

function providerStatus(settings: Record<string, unknown>) {
  return PROVIDERS.map((p) => ({
    id: p.id,
    label: p.label,
    enabled: Boolean(settings[`enable_${p.id}`]),
    configured: p.configured,
    enforce_edge: Boolean(settings[`${p.id}_enforce_edge`]),
    cidrs: p.cidrs,
  }));
}

function publicStatus(settings: Record<string, unknown>) {
  const providers = providerStatus(settings);
  return {
    protection_enabled: settings.protection_enabled !== false,
    under_attack: Boolean(settings.under_attack),
    under_attack_rpm: Number(settings.under_attack_rpm ?? 30),
    normal_rpm: Number(settings.normal_rpm ?? 120),
    challenge_enabled: settings.challenge_enabled !== false,
    providers,
    active_count: providers.filter((x) => x.enabled).length,
  };
}

export async function register(ctx: ModuleContext) {
  const admin = requireAdmin(ctx.auth);

  for (const p of ctx.apiPrefixes) {
    ctx.app.get(`${p}/admin/ddos/status`, admin, async (c) => {
      const settings = await moduleSettings(ctx.db, 'ddos');
      return ok(c, publicStatus(settings));
    });

    ctx.app.get(`${p}/admin/ddos/providers`, admin, async (c) => {
      const settings = await moduleSettings(ctx.db, 'ddos');
      return ok(c, providerStatus(settings));
    });

    ctx.app.post(`${p}/admin/ddos/under-attack`, admin, async (c) => {
      const body = await readJsonBody(c);
      if (body instanceof Response) return body;
      const enabled = Boolean(body.enabled);
      const settings = await saveModuleSettings(ctx.db, 'ddos', { under_attack: enabled });
      return ok(c, { under_attack: enabled, status: publicStatus(settings), remote: { ok: true, skipped: true } });
    });

    ctx.app.post(`${p}/admin/ddos/providers/:id/toggle`, admin, async (c) => {
      const body = await readJsonBody(c);
      if (body instanceof Response) return body;
      const id = c.req.param('id');
      if (!PROVIDERS.some((x) => x.id === id)) return fail(c, 'Unknown provider', 404);
      const settings = await saveModuleSettings(ctx.db, 'ddos', { [`enable_${id}`]: Boolean(body.enabled) });
      return ok(c, { id, enabled: Boolean(body.enabled), status: publicStatus(settings) });
    });

    ctx.app.post(`${p}/admin/ddos/sync-cloudflare-ips`, admin, async (c) =>
      ok(c, { synced: false, message: 'Cloudflare IP sync not implemented in Node baseline' }),
    );
  }
}
