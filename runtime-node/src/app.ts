import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { AppConfig } from './config.js';
import { AuthService } from './auth/AuthService.js';
import { AdminCrud } from './crud/AdminCrud.js';
import type { Database } from './db/Database.js';
import { fail, ok } from './http/envelope.js';
import { availableCapabilities, loadCapabilitiesDoc } from './platform/capabilities.js';
import { EventBus } from './platform/events.js';
import { EventCatalog } from './platform/EventCatalog.js';
import { requireAdmin, requireAuth } from './core/authMiddleware.js';
import { requirePermission } from './core/permissionMiddleware.js';
import { healthHandler, siteHandler } from './modules/publicSite.js';
import { registerAllModules } from './modules/registerAll.js';
import { PackageLoader } from './packages/PackageLoader.js';
import { registerModuleAssetRoutes } from './packages/ModuleAssets.js';
import { syncPackageSources } from './packages/PackageSourceSync.js';
import {
  platformFingerprintMiddleware,
  registerPlatformFingerprint,
} from './support/platformFingerprint.js';

type Vars = {
  Variables: {
    user: Awaited<ReturnType<AuthService['meFromBearer']>>;
  };
};

export async function createApp(db: Database, cfg: AppConfig) {
  const app = new Hono<Vars>();
  const events = new EventBus();
  const auth = new AuthService(db, cfg);
  const crud = new AdminCrud(db, events);
  const prefixes = ['/api/v1', '/api'];

  app.use(
    '*',
    cors({
      origin: (origin) => {
        if (!origin) return cfg.url;
        if (cfg.corsOrigins.includes('*')) return origin;
        return cfg.corsOrigins.includes(origin) ? origin : cfg.url;
      },
      allowHeaders: [
        'Authorization',
        'Content-Type',
        'Accept-Language',
        'X-Scheduler-Token',
        'X-Jasefly-Ts',
        'X-Jasefly-Nonce',
        'X-Jasefly-Sign',
      ],
      allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      credentials: true,
    }),
  );

  app.use('*', platformFingerprintMiddleware());
  registerPlatformFingerprint(app);

  for (const p of prefixes) {
    app.get(`${p}/health`, (c) => healthHandler(c));
    app.get(`${p}/site`, (c) => siteHandler(c, db));
    app.get(`${p}/capabilities`, (c) => {
      const doc = loadCapabilitiesDoc();
      return ok(c, {
        runtime: process.env.BEHAVIOR_PARITY === '1' || cfg.env === 'test' ? 'php-shared' : cfg.runtime,
        baseline: doc.baseline,
        extended: doc.extended,
        available: availableCapabilities(cfg),
      });
    });

    app.post(`${p}/auth/login`, async (c) => {
      const body = (await c.req.json().catch(() => ({}))) as { email?: string; password?: string };
      const res = await auth.login(String(body.email ?? ''), String(body.password ?? ''));
      if (!res.ok) return fail(c, res.error, res.status as 401 | 503);
      return ok(c, res.data);
    });

    app.post(`${p}/auth/2fa/verify`, async (c) => {
      const body = (await c.req.json().catch(() => ({}))) as {
        challenge_token?: string;
        code?: string;
      };
      const res = await auth.verify2fa(String(body.challenge_token ?? ''), String(body.code ?? ''));
      if (!res.ok) return fail(c, res.error, res.status as 401);
      return ok(c, res.data);
    });

    app.post(`${p}/auth/refresh`, async (c) => {
      const body = (await c.req.json().catch(() => ({}))) as { refresh_token?: string };
      const res = await auth.refresh(String(body.refresh_token ?? ''));
      if (!res.ok) return fail(c, res.error, res.status as 401);
      return ok(c, res.data);
    });

    app.post(`${p}/auth/logout`, async (c) => {
      const body = (await c.req.json().catch(() => ({}))) as { refresh_token?: string };
      const token = String(body.refresh_token ?? '');
      if (token && (await db.tableExists('refresh_tokens'))) {
        const { createHash } = await import('node:crypto');
        const hash = createHash('sha256').update(token).digest('hex');
        await db.run('DELETE FROM refresh_tokens WHERE token_hash=?', [hash]);
      }
      return ok(c, { message: 'Logged out' });
    });

    app.get(`${p}/auth/me`, requireAuth(auth), async (c) => {
      const user = c.get('user');
      if (!user) return fail(c, 'Unauthorized', 401);
      return ok(c, await auth.mePayload(user));
    });
  }

  const packageLoader = new PackageLoader({
    app,
    db,
    cfg,
    events,
    apiPrefixes: prefixes,
    auth,
    crud,
  });

  // Safe package FE assets — before catch-all admin CRUD
  registerModuleAssetRoutes(app, db, cfg.storagePath);

  // Package HTTP dispatcher (table-driven — safe after matcher build / late enable)
  for (const p of prefixes) {
    app.use(`${p}/*`, packageLoader.dispatcher());
  }

  // Sync modules-src → storage and enable (test: all with Node entry; prod: plugin-enabled)
  await syncPackageSources(db, cfg);

  await registerAllModules({
    app,
    db,
    cfg,
    events,
    auth,
    crud,
    apiPrefixes: prefixes,
    packageLoader,
  });

  // Method-not-allowed stubs BEFORE package boot (Hono first-match wins).
  // PHP ProjectsModule has GET/PUT/DELETE /admin/projects/{id} → POST …/reorder = 405.
  for (const p of prefixes) {
    app.post(`${p}/admin/projects/reorder`, (c) => fail(c, 'Method not allowed', 405));
  }

  // Boot enabled ZIP package Node backends (parallel to legacy static modules)
  await packageLoader.bootEnabled();

  for (const p of prefixes) {
    app.get(`${p}/admin/platform/events`, requireAdmin(auth), async (c) => {
      return ok(c, { events: EventCatalog.list() });
    });
    // PHP OrdersModule / Payments package: GET list/show only — no generic CRUD write/delete.
    // Register before catch-all so Hono does not invent methods via AdminCrud.
    app.post(`${p}/admin/orders`, (c) => fail(c, 'Method not allowed', 405));
    app.put(`${p}/admin/orders/:id`, (c) => fail(c, 'Method not allowed', 405));
    app.delete(`${p}/admin/orders/:id`, (c) => fail(c, 'Method not allowed', 405));
    app.post(`${p}/admin/payments`, (c) => fail(c, 'Method not allowed', 405));
    app.put(`${p}/admin/payments/:id`, (c) => fail(c, 'Method not allowed', 405));
    app.delete(`${p}/admin/payments/:id`, (c) => fail(c, 'Method not allowed', 405));

    // Extracted from host ContentModule on PHP; keep Node catch-all from inventing them
    // (auth 401) while PHP returns bare 404.
    const absentHostAdmin = new Set(['blog-categories', 'blog-tags']);

    // Generic admin CRUD — after module routes so /admin/access/bootstrap etc. win.
    // Still covers package tables whose Node fixtures only register a subset of routes
    // (blog/products/…) until package Node parity is complete.
    const adminGate = [requireAdmin(auth), requirePermission(auth)] as const;
    app.get(`${p}/admin/:resource`, async (c, next) => {
      if (absentHostAdmin.has(c.req.param('resource'))) return fail(c, 'Not found', 404);
      return next();
    }, ...adminGate, async (c) => {
      const resource = c.req.param('resource');
      if (crud.singletonTable(resource)) return crud.getSingleton(c, resource);
      return crud.list(c, resource);
    });
    app.post(`${p}/admin/:resource`, async (c, next) => {
      if (absentHostAdmin.has(c.req.param('resource'))) return fail(c, 'Not found', 404);
      return next();
    }, ...adminGate, async (c) => {
      if (c.req.param('resource') === 'orders') return fail(c, 'Method not allowed', 405);
      return crud.create(c, c.req.param('resource'));
    });
    app.get(`${p}/admin/:resource/:id`, async (c, next) => {
      if (absentHostAdmin.has(c.req.param('resource'))) return fail(c, 'Not found', 404);
      return next();
    }, ...adminGate, async (c) => crud.show(c, c.req.param('resource'), c.req.param('id')));
    app.put(`${p}/admin/:resource/:id`, async (c, next) => {
      if (absentHostAdmin.has(c.req.param('resource'))) return fail(c, 'Not found', 404);
      return next();
    }, ...adminGate, async (c) => {
      const resource = c.req.param('resource');
      if (resource === 'orders') return fail(c, 'Method not allowed', 405);
      if (crud.singletonTable(resource) && c.req.param('id') === undefined) {
        return crud.putSingleton(c, resource);
      }
      return crud.update(c, resource, c.req.param('id'));
    });
    app.put(`${p}/admin/:resource`, async (c, next) => {
      if (absentHostAdmin.has(c.req.param('resource'))) return fail(c, 'Not found', 404);
      return next();
    }, ...adminGate, async (c) => {
      const resource = c.req.param('resource');
      if (crud.singletonTable(resource)) return crud.putSingleton(c, resource);
      return fail(c, 'Not found', 404);
    });
    app.delete(`${p}/admin/:resource/:id`, async (c, next) => {
      if (absentHostAdmin.has(c.req.param('resource'))) return fail(c, 'Not found', 404);
      return next();
    }, ...adminGate, async (c) => {
      if (c.req.param('resource') === 'orders') return fail(c, 'Method not allowed', 405);
      return crud.remove(c, c.req.param('resource'), c.req.param('id'));
    });
  }

  app.notFound((c) => fail(c, 'Not found', 404));
  app.onError((err, c) => {
    console.error(err);
    return fail(c, cfg.env === 'production' ? 'Internal server error' : err.message, 500);
  });

  return app;
}
