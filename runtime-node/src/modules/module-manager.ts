import type { ModuleContext } from '../core/types.js';
import { requireAdmin } from '../core/authMiddleware.js';
import { readContractJson } from '../config.js';
import { ok, fail } from '../http/envelope.js';
import { availableCapabilities, loadCapabilitiesDoc } from '../platform/capabilities.js';
import { ModulePackageService } from '../packages/ModulePackageService.js';
import { presentModule, runtimeManifests } from '../packages/ModuleRegistry.js';
import type { Row } from '../db/Database.js';
import { readJsonBody } from './_helpers.js';

export const name = 'module-manager';

function svc(ctx: ModuleContext): ModulePackageService {
  return new ModulePackageService(ctx.db, ctx.cfg.storagePath);
}

function decodeOperationLog(row: Row): Record<string, unknown> {
  const out = { ...row } as Record<string, unknown>;
  if (out.log_json && typeof out.log_json === 'string') {
    try {
      out.log = JSON.parse(out.log_json);
    } catch {
      out.log = [];
    }
  } else {
    out.log = [];
  }
  delete out.log_json;
  return out;
}

export async function register(ctx: ModuleContext) {
  const admin = requireAdmin(ctx.auth);

  for (const p of ctx.apiPrefixes) {
    ctx.app.get(`${p}/admin/modules`, admin, async (c) => {
      const service = svc(ctx);
      if (!(await ctx.db.tableExists('installed_modules'))) {
        return ok(c, []);
      }
      const rows = await service.registry.listAll();
      const items = await Promise.all(
        rows.map(async (row) => {
          const slug = String(row.slug ?? '');
          const rollback = slug ? await service.registry.hasRollbackSnapshot(slug) : false;
          return presentModule(row, rollback);
        }),
      );
      return ok(c, items);
    });

    ctx.app.get(`${p}/admin/modules/runtime`, admin, async (c) => {
      const service = svc(ctx);
      if (!(await ctx.db.tableExists('installed_modules'))) {
        return ok(c, []);
      }
      const rows = await service.registry.listAll();
      return ok(c, runtimeManifests(rows));
    });

    ctx.app.get(`${p}/admin/modules/:slug`, admin, async (c) => {
      const slug = c.req.param('slug');
      const service = svc(ctx);
      const row = await service.registry.getBySlug(slug);
      if (!row) return fail(c, 'Module not found', 404);
      const rollback = await service.registry.hasRollbackSnapshot(slug);
      return ok(c, presentModule(row, rollback));
    });

    ctx.app.get(`${p}/admin/modules/:slug/health`, admin, async (c) => {
      const slug = c.req.param('slug');
      const row = await svc(ctx).registry.getBySlug(slug);
      if (!row) return fail(c, 'Module not found', 404);
      const result = await svc(ctx).health.check(slug);
      return ok(c, result);
    });

    ctx.app.post(`${p}/admin/modules/:slug/health`, admin, async (c) => {
      const slug = c.req.param('slug');
      const row = await svc(ctx).registry.getBySlug(slug);
      if (!row) return fail(c, 'Module not found', 404);
      const result = await svc(ctx).health.check(slug);
      return ok(c, result);
    });

    ctx.app.get(`${p}/admin/modules/:slug/migrations`, admin, async (c) => {
      const slug = c.req.param('slug');
      const row = await svc(ctx).registry.getBySlug(slug);
      if (!row) return fail(c, 'Module not found', 404);
      return ok(c, await svc(ctx).registry.listModuleMigrations(slug));
    });

    ctx.app.get(`${p}/admin/modules/:slug/files`, admin, async (c) => {
      const slug = c.req.param('slug');
      const row = await svc(ctx).registry.getBySlug(slug);
      if (!row) return fail(c, 'Module not found', 404);
      return ok(c, await svc(ctx).registry.listModuleFiles(slug));
    });

    ctx.app.get(`${p}/admin/modules/:slug/compatibility`, admin, async (c) => {
      const slug = c.req.param('slug');
      const row = await svc(ctx).registry.getBySlug(slug);
      if (!row) return fail(c, 'Module not found', 404);
      return ok(c, svc(ctx).checkCompatibility(slug));
    });

    ctx.app.get(`${p}/admin/module-operations`, admin, async (c) => {
      const slug = String(c.req.query('slug') ?? '').trim() || null;
      const limit = Math.max(1, Math.min(200, Number(c.req.query('limit') || 50)));
      const rows = await svc(ctx).registry.listOperations(slug, limit);
      return ok(c, rows.map(decodeOperationLog));
    });

    ctx.app.get(`${p}/admin/module-operations/:id`, admin, async (c) => {
      const row = await svc(ctx).registry.getOperation(Number(c.req.param('id')));
      if (!row) return fail(c, 'Operation not found', 404);
      return ok(c, decodeOperationLog(row));
    });

    ctx.app.get(`${p}/admin/platform/sdk`, admin, async (c) => {
      const snapshot = readContractJson('platform/api-snapshot.v1.json');
      return ok(c, snapshot);
    });

    ctx.app.get(`${p}/admin/platform/capabilities`, admin, async (c) => {
      const doc = loadCapabilitiesDoc();
      const caps = availableCapabilities(ctx.cfg);
      return ok(c, { capabilities: caps, providers: { baseline: doc.baseline, extended: doc.extended } });
    });

    ctx.app.post(`${p}/admin/modules/upload`, admin, async (c) => {
      try {
        const contentType = c.req.header('content-type') ?? '';
        let originalName = 'package.zip';
        let buf: Buffer;

        if (contentType.includes('application/json')) {
          const body = await c.req.json<{ filename?: string; base64?: string }>();
          if (!body.base64) return fail(c, 'base64 required', 422);
          originalName = body.filename ?? originalName;
          buf = Buffer.from(body.base64, 'base64');
        } else if (contentType.includes('multipart/form-data')) {
          const form = await c.req.parseBody();
          const file = form.package ?? form.file;
          if (!file || typeof file === 'string') {
            return fail(c, 'Missing file field "package"', 422);
          }
          originalName = file.name || originalName;
          buf = Buffer.from(await file.arrayBuffer());
        } else {
          const raw = Buffer.from(await c.req.arrayBuffer());
          if (!raw.length) return fail(c, 'Missing package payload', 422);
          buf = raw;
        }

        const result = await svc(ctx).uploadBuffer(originalName, buf);
        return ok(c, result);
      } catch (e) {
        return fail(c, e instanceof Error ? e.message : 'Upload failed', 422);
      }
    });

    ctx.app.post(`${p}/admin/modules/inspect`, admin, async (c) => {
      const body = await readJsonBody(c);
      if (body instanceof Response) return body;
      const packageId = String(body.package_id ?? '');
      if (!packageId) return fail(c, 'package_id required', 422);
      try {
        return ok(c, svc(ctx).inspect(packageId));
      } catch (e) {
        return fail(c, e instanceof Error ? e.message : 'Inspect failed', 422);
      }
    });

    ctx.app.post(`${p}/admin/modules/reconcile-mirror`, admin, async (c) => {
      const body = await readJsonBody(c).catch(() => ({} as Record<string, unknown>));
      const apply = body instanceof Response ? false : Boolean(body.apply);
      try {
        return ok(c, await svc(ctx).reconcilePluginMirror(!apply));
      } catch (e) {
        return fail(c, e instanceof Error ? e.message : 'Reconcile failed', 422);
      }
    });

    ctx.app.post(`${p}/admin/modules/:slug/install`, admin, async (c) => {
      try {
        const slug = c.req.param('slug');
        const body = (await c.req.json<{ package_id?: string }>().catch(() => ({ package_id: undefined }))) as {
          package_id?: string;
        };
        const packageId = String(body.package_id ?? '');
        if (!packageId) return fail(c, 'package_id required', 422);
        const result = await svc(ctx).install(slug, packageId);
        return ok(c, result);
      } catch (e) {
        return fail(c, e instanceof Error ? e.message : 'Install failed', 422);
      }
    });

    ctx.app.post(`${p}/admin/modules/:slug/update`, admin, async (c) => {
      try {
        const slug = c.req.param('slug');
        const body = await readJsonBody(c);
        if (body instanceof Response) return body;
        const packageId = String(body.package_id ?? '');
        if (!packageId) return fail(c, 'package_id required', 422);
        const result = await svc(ctx).update(slug, packageId);
        return ok(c, result);
      } catch (e) {
        return fail(c, e instanceof Error ? e.message : 'Update failed', 422);
      }
    });

    ctx.app.post(`${p}/admin/modules/:slug/enable`, admin, async (c) => {
      try {
        const result = await svc(ctx).enable(c.req.param('slug'));
        return ok(c, result);
      } catch (e) {
        return fail(c, e instanceof Error ? e.message : 'Enable failed', 422);
      }
    });

    ctx.app.post(`${p}/admin/modules/:slug/disable`, admin, async (c) => {
      try {
        const result = await svc(ctx).disable(c.req.param('slug'));
        return ok(c, result);
      } catch (e) {
        return fail(c, e instanceof Error ? e.message : 'Disable failed', 422);
      }
    });

    ctx.app.post(`${p}/admin/modules/:slug/uninstall`, admin, async (c) => {
      try {
        const body = await readJsonBody(c).catch(() => ({} as Record<string, unknown>));
        const keepData = body instanceof Response ? true : body.keep_data !== false;
        const result = await svc(ctx).uninstall(c.req.param('slug'), keepData);
        return ok(c, result);
      } catch (e) {
        return fail(c, e instanceof Error ? e.message : 'Uninstall failed', 422);
      }
    });

    ctx.app.delete(`${p}/admin/modules/:slug`, admin, async (c) => {
      try {
        const keepData = String(c.req.query('keep_data') ?? '1') !== '0';
        const result = await svc(ctx).uninstall(c.req.param('slug'), keepData);
        return ok(c, result);
      } catch (e) {
        return fail(c, e instanceof Error ? e.message : 'Uninstall failed', 422);
      }
    });

    ctx.app.post(`${p}/admin/modules/:slug/rollback`, admin, async (c) => {
      try {
        const result = await svc(ctx).rollback(c.req.param('slug'));
        return ok(c, result);
      } catch (e) {
        const code = (e as Error & { status?: number }).status;
        const status = code === 409 ? 409 : 422;
        return fail(c, e instanceof Error ? e.message : 'Rollback failed', status);
      }
    });

    ctx.app.get(`${p}/modules/runtime-assets`, async (c) => {
      const service = svc(ctx);
      if (!(await ctx.db.tableExists('installed_modules'))) {
        return ok(c, []);
      }
      const rows = await service.registry.listAll();
      return ok(c, runtimeManifests(rows));
    });
  }
}
