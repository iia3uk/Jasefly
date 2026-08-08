/**
 * Platform SDK surface for Node ZIP/package modules (contract parity with PHP App\Platform).
 * Packages must depend on this contract — not host internals.
 */
import fs from 'node:fs';
import path from 'node:path';
import type { Context, Next } from 'hono';
import type { AuthService } from '../auth/AuthService.js';
import type { AppConfig } from '../config.js';
import type { AdminCrud } from '../crud/AdminCrud.js';
import type { Database } from '../db/Database.js';
import { hashPassword, verifyPassword } from '../auth/password.js';
import { fail as httpFail, ok as httpOk } from '../http/envelope.js';
import { ModulePaths } from '../packages/ModulePaths.js';
import { isModuleEnabled } from '../plugins/pluginState.js';
import { softDecide, softRespond } from '../plugins/softPluginGate.js';
import { clearOwnedJobHandlers, registerOwnedJobHandler } from '../scheduler/JobHandlerRegistry.js';
import { safeFetch } from '../support/ssrfGuard.js';
import { availableCapabilities, loadCapabilitiesDoc } from './capabilities.js';
import { CapabilityRuntime } from './CapabilityRuntime.js';
import { EventCatalog } from './EventCatalog.js';
import { PackageSurfaceRegistry, type PackageSurfaces } from './PackageSurfaceRegistry.js';
import type { EventBus } from './events.js';

export type PackageHttpHandler = (c: Context) => Response | Promise<Response>;
export type PackageMiddleware = (c: Context, next: Next) => Promise<Response | void> | Response | void;

export type PlatformHttp = {
  apiPrefix(): string;
  get(routePath: string, ...handlers: Array<PackageMiddleware | PackageHttpHandler>): void;
  post(routePath: string, ...handlers: Array<PackageMiddleware | PackageHttpHandler>): void;
  put(routePath: string, ...handlers: Array<PackageMiddleware | PackageHttpHandler>): void;
  delete(routePath: string, ...handlers: Array<PackageMiddleware | PackageHttpHandler>): void;
  patch(routePath: string, ...handlers: Array<PackageMiddleware | PackageHttpHandler>): void;
  /** SSRF-safe outbound fetch */
  fetch(url: string, opts?: { method?: string; headers?: Record<string, string>; body?: string; timeoutMs?: number }): Promise<Response>;
  ok(c: Context, data: unknown, status?: number): Response;
  fail(
    c: Context,
    error: string,
    status?: number,
    errors?: Record<string, unknown> | unknown[] | null,
    extra?: Record<string, unknown>,
  ): Response;
  /** Middleware: require authenticated user (or MCP) */
  auth(): PackageMiddleware;
  /** Middleware: require admin-class role */
  admin(): PackageMiddleware;
  /** Middleware: require permission capability */
  permission(capability: string): PackageMiddleware;
  /** Middleware: require any of the listed capabilities (OR) */
  permissionAny(capabilities: string[]): PackageMiddleware;
  /** Soft in-memory rate limit (shared-hosting safe; per-process) */
  softRateLimit(opts: { max: number; windowMs: number; key?: (c: Context) => string }): PackageMiddleware;
};

export type PlatformEvents = {
  subscribe(event: string, handler: (payload: Record<string, unknown>) => void | Promise<void>, priority?: number): void;
  publish(event: string, payload?: Record<string, unknown>): Promise<void>;
  declare(eventId: string, meta?: { label?: string; category?: string; payload?: Record<string, unknown> }): void;
  hasDeclared(eventId: string): boolean;
  listDeclared(): ReturnType<typeof EventCatalog.list>;
};

export type PlatformCapabilities = {
  has(cap: string): boolean;
  list(): string[];
  baseline(): string[];
  extended(): string[];
  provide(capability: string): void;
  listProvided(): string[];
};

export type PlatformScheduler = {
  registerHandler(type: string, handler: (payload: Record<string, unknown>) => void | Promise<void>): void;
};

export type PlatformMail = {
  send(opts: { to: string; subject: string; body?: string; html?: string }): Promise<{ ok: boolean; error?: string }>;
};

export type PlatformNotifications = {
  send(opts: { user_id?: number; title: string; body?: string; type?: string }): Promise<{ ok: boolean; error?: string }>;
};

export type PlatformSettings = {
  /**
   * Settings access (PHP parity):
   * - `get()` / `all()` → full JSON bag from `modules.settings`
   * - `get(key, default?)` → single key
   * - `set(patch)` → shallow merge into bag
   * - `set(key, value)` → set one key
   * - `getModule(slug)` / `getModule(slug, key, default?)` → read-only other module bag
   */
  get(): Promise<Record<string, unknown>>;
  get(key: string, defaultValue?: unknown): Promise<unknown>;
  set(patch: Record<string, unknown>): Promise<void>;
  set(key: string, value: unknown): Promise<void>;
  all(): Promise<Record<string, unknown>>;
  getModule(moduleSlug: string): Promise<Record<string, unknown>>;
  getModule(moduleSlug: string, key: string, defaultValue?: unknown): Promise<unknown>;
};

export type PlatformSurfaces = {
  register(surfaces: PackageSurfaces): void;
};

export type PlatformPasswords = {
  hash(password: string): Promise<string>;
  verify(password: string, hash: string): Promise<boolean>;
};

export type PlatformPlugins = {
  isEnabled(moduleSlug?: string): Promise<boolean>;
  softGate(c: Context, method: string, isItem: boolean, moduleSlug?: string): Promise<Response | null>;
};

export type PlatformStorage = {
  root(): string;
  resolve(...parts: string[]): string;
  read(relPath: string): string | null;
  write(relPath: string, data: string | Buffer): void;
};

/** Generic admin resource helpers (host AdminCrud) — not domain-specific. */
export type PlatformAdminResources = {
  list(c: Context, resource: string): Promise<Response>;
  show(c: Context, resource: string, id: string): Promise<Response>;
  create(c: Context, resource: string): Promise<Response>;
  update(c: Context, resource: string, id: string): Promise<Response>;
  remove(c: Context, resource: string, id: string): Promise<Response>;
  publish(c: Context, resource: string, id: string): Promise<Response>;
  reorder(c: Context, resource: string): Promise<Response>;
};

/** Allowlisted package-visible config — never secrets (parity with PHP ConfigAdapter getters). */
export type PlatformPackageConfig = {
  get(key: string, defaultValue?: unknown): unknown;
  cmsVersion(): string;
  sdkVersion(): number;
  runtime(): 'node-vps';
  env(): string;
  url(): string;
  name(): string;
};

export interface PlatformContext {
  slug(): string;
  runtime(): 'node-vps';
  database(): Database;
  events(): PlatformEvents;
  config(): PlatformPackageConfig;
  capabilities(): PlatformCapabilities;
  http(): PlatformHttp;
  scheduler(): PlatformScheduler;
  jobs(): PlatformScheduler;
  mail(): PlatformMail;
  notifications(): PlatformNotifications;
  settings(): PlatformSettings;
  storage(): PlatformStorage;
  passwords(): PlatformPasswords;
  plugins(): PlatformPlugins;
  permissions(): { can(capability: string): Promise<boolean> };
  /** Package → host surface registration (trash/dashboard/sitemap/media/ACL/schema). */
  surfaces(): PlatformSurfaces;
  /** Present when host injects AdminCrud */
  adminResources(): PlatformAdminResources | null;
}

export type PackageRouteTable = {
  get(key: string): PackageHttpHandler | undefined;
  set(key: string, handler: PackageHttpHandler): void;
  has(key: string): boolean;
};

export type PlatformContextDeps = {
  db: Database;
  events: EventBus;
  cfg: AppConfig;
  slug: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  app: { get: Function; post: Function; put: Function; delete: Function };
  apiPrefixes: string[];
  isActive: () => boolean;
  routes: PackageRouteTable;
  auth?: AuthService;
  crud?: AdminCrud;
  onRouteRegistered?: (method: string, fullPath: string) => void;
  onSubscribe?: (
    event: string,
    handler: (payload: Record<string, unknown>) => void | Promise<void>,
  ) => void;
};

const ADMIN_ROLES = new Set(['admin', 'super_admin', 'editor']);

function hasUserCapability(caps: string[], needed: string): boolean {
  if (caps.includes('*') || caps.includes(needed)) return true;
  const aliases: Record<string, string> = {
    'content.update': 'content.edit_any',
    'content.edit_any': 'content.update',
    'content.delete': 'content.delete_any',
    'content.delete_any': 'content.delete',
  };
  const alt = aliases[needed];
  return alt !== undefined && caps.includes(alt);
}

function normalizeRoute(routePath: string): string {
  const p = routePath.trim();
  if (!p.startsWith('/')) return `/${p}`;
  return p;
}

function composeHandlers(handlers: Array<PackageMiddleware | PackageHttpHandler>): PackageHttpHandler {
  if (handlers.length === 0) {
    return async () =>
      new Response(JSON.stringify({ success: false, error: 'No handler' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
  }
  const final = handlers[handlers.length - 1] as PackageHttpHandler;
  const mws = handlers.slice(0, -1) as PackageMiddleware[];
  return async (c) => {
    let idx = 0;
    const run = async (): Promise<Response> => {
      if (idx >= mws.length) return final(c);
      const mw = mws[idx++];
      let nextResult: Response | undefined;
      const next = (async () => {
        nextResult = await run();
      }) as unknown as Next;
      const out = await mw(c, next);
      if (out instanceof Response) return out;
      if (nextResult) return nextResult;
      return new Response(JSON.stringify({ success: false, error: 'No response' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    };
    return run();
  };
}

export function createPlatformContext(deps: PlatformContextDeps): PlatformContext {
  const { db, events, cfg, slug, app, apiPrefixes, isActive, auth, crud } = deps;
  const paths = new ModulePaths(cfg.storagePath);
  const doc = loadCapabilitiesDoc();
  const hostCaps = new Set(availableCapabilities(cfg));
  const primaryPrefix = apiPrefixes[0] ?? '/api/v1';
  const gate =
    (handler: PackageHttpHandler): PackageHttpHandler =>
    async (c) => {
      if (!isActive()) {
        return new Response(JSON.stringify({ success: false, error: 'Not found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return handler(c);
    };

  const mount = (
    method: 'get' | 'post' | 'put' | 'delete' | 'patch',
    routePath: string,
    handlers: Array<PackageMiddleware | PackageHttpHandler>,
  ) => {
    void app;
    const rel = normalizeRoute(routePath);
    const composed = gate(composeHandlers(handlers));
    for (const prefix of apiPrefixes) {
      const full = `${prefix}${rel}`.replace(/\/{2,}/g, '/');
      const key = `${method.toUpperCase()} ${full}`;
      deps.routes.set(key, composed);
      deps.onRouteRegistered?.(method.toUpperCase(), full);
    }
  };

  const authMw = (): PackageMiddleware => async (c, next) => {
    if (!auth) return httpFail(c, 'Unauthorized', 401);
    const user = await auth.meFromBearer(c.req.header('authorization'), c);
    if (!user) return httpFail(c, 'Unauthorized', 401);
    c.set('user', user);
    await next();
  };

  const adminMw = (): PackageMiddleware => async (c, next) => {
    if (!auth) return httpFail(c, 'Unauthorized', 401);
    const user = await auth.meFromBearer(c.req.header('authorization'), c);
    if (!user) return httpFail(c, 'Unauthorized', 401);
    if (user === 'mcp') {
      c.set('user', user);
      await next();
      return;
    }
    const role = String((user as { role?: string }).role ?? '');
    if (!ADMIN_ROLES.has(role)) return httpFail(c, 'Forbidden', 403);
    c.set('user', user);
    await next();
  };

  const permissionMw = (capability: string): PackageMiddleware => async (c, next) => {
    if (!auth) return httpFail(c, 'Unauthorized', 401);
    const user = c.get('user') ?? (await auth.meFromBearer(c.req.header('authorization'), c));
    if (!user) return httpFail(c, 'Unauthorized', 401);
    c.set('user', user);
    if (user === 'mcp') {
      await next();
      return;
    }
    const cap = capability.trim();
    if (!cap) return httpFail(c, 'Forbidden', 403);
    const payload = await auth.mePayload(user);
    if (hasUserCapability(payload.capabilities ?? [], cap)) {
      await next();
      return;
    }
    return httpFail(c, 'Forbidden', 403);
  };

  const rateBuckets = new Map<string, { n: number; reset: number }>();

  const httpFacade: PlatformHttp = {
    apiPrefix: () => primaryPrefix,
    get: (p, ...h) => mount('get', p, h),
    post: (p, ...h) => mount('post', p, h),
    put: (p, ...h) => mount('put', p, h),
    delete: (p, ...h) => mount('delete', p, h),
    patch: (p, ...h) => mount('patch', p, h),
    fetch: (url, opts = {}) =>
      safeFetch(url, {
        method: opts.method,
        headers: opts.headers,
        body: opts.body,
        timeoutMs: opts.timeoutMs,
      }),
    ok: (c, data, status = 200) => httpOk(c, data, status as 200),
    fail: (c, error, status = 400, errors, extra) =>
      httpFail(c, error, status as 400, errors ?? [], extra ?? {}),
    auth: authMw,
    admin: adminMw,
    permission: permissionMw,
    permissionAny: (capabilities) => async (c, next) => {
      const caps = capabilities.map((x) => String(x || '').trim()).filter(Boolean);
      if (!caps.length) return httpFail(c, 'Forbidden', 403);
      if (!auth) return httpFail(c, 'Unauthorized', 401);
      const user = c.get('user') ?? (await auth.meFromBearer(c.req.header('authorization'), c));
      if (!user) return httpFail(c, 'Unauthorized', 401);
      c.set('user', user);
      if (user === 'mcp') {
        await next();
        return;
      }
      const payload = await auth.mePayload(user);
      const userCaps = payload.capabilities ?? [];
      if (caps.some((cap) => hasUserCapability(userCaps, cap))) {
        await next();
        return;
      }
      return httpFail(c, 'Forbidden', 403);
    },
    softRateLimit: (opts) => async (c, next) => {
      const keyFn = opts.key ?? ((ctx) => ctx.req.header('x-forwarded-for')?.split(',')[0]?.trim() || 'local');
      const bucketKey = `${slug}:${keyFn(c)}`;
      const now = Date.now();
      let b = rateBuckets.get(bucketKey);
      if (!b || now > b.reset) {
        b = { n: 0, reset: now + opts.windowMs };
        rateBuckets.set(bucketKey, b);
      }
      b.n += 1;
      if (b.n > opts.max) return httpFail(c, 'Too many requests', 429);
      await next();
    },
  };

  async function readSettingsFor(name: string): Promise<Record<string, unknown>> {
    if (!(await db.tableExists('modules'))) return {};
    const row = await db.one('SELECT settings FROM modules WHERE name=? LIMIT 1', [name]);
    if (!row?.settings) return {};
    if (typeof row.settings === 'string') {
      try {
        return JSON.parse(row.settings) as Record<string, unknown>;
      } catch {
        return {};
      }
    }
    return (row.settings as Record<string, unknown>) ?? {};
  }

  async function writeSettingsFor(name: string, next: Record<string, unknown>): Promise<void> {
    if (!(await db.tableExists('modules'))) return;
    const exists = await db.one('SELECT name FROM modules WHERE name=?', [name]);
    const json = JSON.stringify(next);
    if (exists) {
      await db.run('UPDATE modules SET settings=? WHERE name=?', [json, name]);
    } else {
      await db.run('INSERT INTO modules (name, is_enabled, settings) VALUES (?, 0, ?)', [name, json]);
    }
  }

  function pickSetting(bag: Record<string, unknown>, key: string, defaultValue: unknown): unknown {
    return Object.prototype.hasOwnProperty.call(bag, key) ? bag[key] : defaultValue;
  }

  const settingsFacade: PlatformSettings = {
    get: (async (key?: string, defaultValue?: unknown) => {
      const bag = await readSettingsFor(slug);
      if (key === undefined || key === '') return bag;
      return pickSetting(bag, String(key), defaultValue);
    }) as PlatformSettings['get'],
    set: (async (keyOrPatch: string | Record<string, unknown>, value?: unknown) => {
      const cur = await readSettingsFor(slug);
      if (typeof keyOrPatch === 'string') {
        await writeSettingsFor(slug, { ...cur, [keyOrPatch]: value });
        return;
      }
      await writeSettingsFor(slug, { ...cur, ...keyOrPatch });
    }) as PlatformSettings['set'],
    all: async () => readSettingsFor(slug),
    getModule: (async (moduleSlug: string, key?: string, defaultValue?: unknown) => {
      const bag = await readSettingsFor(moduleSlug.trim());
      if (key === undefined || key === '') return bag;
      return pickSetting(bag, String(key), defaultValue);
    }) as PlatformSettings['getModule'],
  };

  const eventsFacade: PlatformEvents = {
    subscribe: (event, handler, priority = 100) => {
      const wrapped = async (payload: Record<string, unknown>) => {
        if (!isActive()) return;
        await handler(payload);
      };
      events.subscribe(event, wrapped, priority);
      deps.onSubscribe?.(event, wrapped);
    },
    publish: async (event, payload = {}) => {
      await events.publish(event, { ...payload, _module: slug });
    },
    declare: (eventId, meta = {}) => {
      EventCatalog.declare(eventId, slug, meta);
    },
    hasDeclared: (eventId) => EventCatalog.has(eventId),
    listDeclared: () => EventCatalog.list(),
  };

  const capsFacade: PlatformCapabilities = {
    has: (cap) => hostCaps.has(cap) || CapabilityRuntime.has(cap),
    list: () => [...new Set([...hostCaps, ...CapabilityRuntime.listProvided()])].sort(),
    baseline: () => [...doc.baseline],
    extended: () => [...doc.extended],
    provide: (capability) => {
      CapabilityRuntime.provide(slug, capability);
    },
    listProvided: () => CapabilityRuntime.listByOwner(slug),
  };

  const schedFacade: PlatformScheduler = {
    registerHandler: (type, handler) => {
      registerOwnedJobHandler(slug, type, async (payload, jobCtx) => {
        if (!isActive()) return;
        await handler(payload);
        void jobCtx;
      });
    },
  };

  const storageRoot = path.join(paths.moduleRoot(slug), '.data');
  paths.ensureDir(storageRoot);

  const storageFacade: PlatformStorage = {
    root: () => storageRoot,
    resolve: (...parts) => {
      const target = path.resolve(storageRoot, ...parts);
      return paths.assertContained(storageRoot, target);
    },
    read: (relPath) => {
      try {
        const abs = storageFacade.resolve(relPath);
        if (!fs.existsSync(abs)) return null;
        return fs.readFileSync(abs, 'utf8');
      } catch {
        return null;
      }
    },
    write: (relPath, data) => {
      const abs = storageFacade.resolve(relPath);
      paths.ensureDir(path.dirname(abs));
      fs.writeFileSync(abs, data);
    },
  };

  const adminResources: PlatformAdminResources | null = crud
    ? {
        list: (c, resource) => crud.list(c, resource),
        show: (c, resource, id) => crud.show(c, resource, id),
        create: (c, resource) => crud.create(c, resource),
        update: (c, resource, id) => crud.update(c, resource, id),
        remove: (c, resource, id) => crud.remove(c, resource, id),
        publish: (c, resource, id) => crud.publish(c, resource, id),
        reorder: (c, resource) => crud.reorder(c, resource),
      }
    : null;

  const publicConfig: PlatformPackageConfig = {
    get: (key, defaultValue = null) => {
      const map: Record<string, unknown> = {
        name: cfg.name,
        url: cfg.url,
        env: cfg.env,
        timezone: cfg.timezone,
        runtime: cfg.runtime,
        cms_version: '1.0.0',
        sdk_version: 1,
      };
      return Object.prototype.hasOwnProperty.call(map, key) ? map[key] : defaultValue;
    },
    cmsVersion: () => '1.0.0',
    sdkVersion: () => 1,
    runtime: () => 'node-vps',
    env: () => cfg.env,
    url: () => cfg.url,
    name: () => cfg.name,
  };

  return {
    slug: () => slug,
    runtime: () => 'node-vps',
    database: () => db,
    events: () => eventsFacade,
    config: () => publicConfig,
    capabilities: () => capsFacade,
    http: () => httpFacade,
    scheduler: () => schedFacade,
    jobs: () => schedFacade,
    mail: () => ({
      send: async (opts) => {
        // Soft host primitive: log when table exists; fail-closed otherwise (no fake success).
        try {
          if (!(await db.tableExists('mail_log'))) {
            return { ok: false, error: 'mail_unavailable' };
          }
          await db.run(
            `INSERT INTO mail_log (to_addr, subject, body, created_at) VALUES (?, ?, ?, datetime('now'))`,
            [opts.to, opts.subject, opts.html ?? opts.body ?? ''],
          );
          return { ok: true };
        } catch (e) {
          return { ok: false, error: e instanceof Error ? e.message : String(e) };
        }
      },
    }),
    notifications: () => ({
      send: async (opts) => {
        try {
          if (!(await db.tableExists('notifications'))) {
            return { ok: false, error: 'notifications_unavailable' };
          }
          await db.run(
            `INSERT INTO notifications (user_id, title, body, type, is_read, created_at)
             VALUES (?, ?, ?, ?, 0, datetime('now'))`,
            [opts.user_id ?? null, opts.title, opts.body ?? '', opts.type ?? 'info'],
          );
          return { ok: true };
        } catch (e) {
          return { ok: false, error: e instanceof Error ? e.message : String(e) };
        }
      },
    }),
    settings: () => settingsFacade,
    storage: () => storageFacade,
    passwords: () => ({
      hash: (password) => hashPassword(password),
      verify: (password, hash) => verifyPassword(password, hash),
    }),
    plugins: () => ({
      isEnabled: async (moduleSlug?: string) => isModuleEnabled(db, moduleSlug?.trim() || slug),
      softGate: async (c, method, isItem, moduleSlug?) => {
        const on = await isModuleEnabled(db, moduleSlug?.trim() || slug);
        return softRespond(c, softDecide(on, method, isItem), moduleSlug?.trim() || slug);
      },
    }),
    permissions: () => ({
      can: async (capability: string) => hostCaps.has(capability) || CapabilityRuntime.has(capability),
    }),
    surfaces: () => ({
      register: (surfaces: PackageSurfaces) => {
        PackageSurfaceRegistry.register(slug, surfaces);
      },
    }),
    adminResources: () => adminResources,
  };
}

export function clearPackageOwnership(slug: string): void {
  EventCatalog.clearOwner(slug);
  CapabilityRuntime.revokeModule(slug);
  clearOwnedJobHandlers(slug);
  PackageSurfaceRegistry.clearOwner(slug);
}
