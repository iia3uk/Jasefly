/**
 * Generic package backend loader — discovers installed/enabled packages and boots Node entrypoints.
 * No slug whitelist. Parallel to legacy registerAll.ts static domains.
 */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import type { Hono } from 'hono';
import type { AuthService } from '../auth/AuthService.js';
import type { AppConfig } from '../config.js';
import type { AdminCrud } from '../crud/AdminCrud.js';
import type { Database } from '../db/Database.js';
import {
  clearPackageOwnership,
  createPlatformContext,
  type PackageHttpHandler,
  type PackageRouteTable,
  type PlatformContext,
} from '../platform/sdk.js';
import { PackageSurfaceRegistry, type PackageSurfaces } from '../platform/PackageSurfaceRegistry.js';
import type { EventBus } from '../platform/events.js';
import { invokePackageEntry } from './invokePackageEntry.js';
import { ModulePaths } from './ModulePaths.js';
import { ModuleRegistry } from './ModuleRegistry.js';
import { packageRouteDispatcher } from './packageRouteDispatch.js';

export type PackageLoadResult = {
  slug: string;
  ok: boolean;
  skipped?: boolean;
  reason?: string;
  error?: string;
};

type LoadedState = {
  active: boolean;
  routesRegistered: boolean;
  entryPath: string | null;
  routeKeys: string[];
  subscriptions: Array<{ event: string; fn: (payload: Record<string, unknown>) => void | Promise<void> }>;
};

export type PackageLoaderOptions = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  app: Hono<any>;
  db: Database;
  cfg: AppConfig;
  events: EventBus;
  apiPrefixes: string[];
  auth: AuthService;
  crud: AdminCrud;
};

function resolveNodeEntrypoint(moduleRoot: string, manifest: Record<string, unknown>): string | null {
  const entries = (manifest.entrypoints ?? {}) as Record<string, unknown>;
  const candidates = [
    entries.node,
    entries.nodejs,
    entries['backend-node'],
    entries.node_backend,
    typeof manifest.node_entrypoint === 'string' ? manifest.node_entrypoint : null,
  ].filter((x): x is string => typeof x === 'string' && x.trim().length > 0);

  candidates.push(
    'backend/node/index.ts',
    'backend/node/index.mjs',
    'backend/node/index.js',
    'backend/index.mjs',
    'backend/index.js',
    'backend/node.mjs',
    'backend/node.js',
  );

  for (const rel of candidates) {
    const cleaned = rel.replace(/^[/\\]+/, '').replace(/\\/g, '/');
    if (cleaned.includes('..')) continue;
    const abs = path.join(moduleRoot, ...cleaned.split('/'));
    if (fs.existsSync(abs) && fs.statSync(abs).isFile()) return abs;
  }
  return null;
}

function readManifest(moduleRoot: string): Record<string, unknown> | null {
  const p = path.join(moduleRoot, 'module.json');
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8')) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export class PackageLoader {
  private readonly paths: ModulePaths;
  private readonly registry: ModuleRegistry;
  private readonly loaded = new Map<string, LoadedState>();
  private readonly routeHandlers = new Map<string, PackageHttpHandler>();
  private readonly routes: PackageRouteTable & {
    entries(): IterableIterator<[string, PackageHttpHandler]>;
  } = {
    get: (key) => this.routeHandlers.get(key),
    set: (key, handler) => {
      this.routeHandlers.set(key, handler);
    },
    has: (key) => this.routeHandlers.has(key),
    entries: () => this.routeHandlers.entries(),
  };

  constructor(private opts: PackageLoaderOptions) {
    this.paths = new ModulePaths(opts.cfg.storagePath);
    this.registry = new ModuleRegistry(opts.db, this.paths);
  }

  isActive(slug: string): boolean {
    return this.loaded.get(slug)?.active === true;
  }

  routeTable(): PackageRouteTable {
    return this.routes;
  }

  dispatcher() {
    return packageRouteDispatcher(this.routes);
  }

  async bootEnabled(): Promise<PackageLoadResult[]> {
    const rows = await this.registry.listAll();
    const results: PackageLoadResult[] = [];
    for (const row of rows) {
      if (String(row.status ?? '') !== 'enabled') continue;
      const health = String(row.health_status ?? '');
      if (health === 'quarantined' || health === 'failed') continue;
      const slug = String(row.slug ?? '');
      if (!slug) continue;
      results.push(await this.load(slug));
    }
    return results;
  }

  async load(slug: string): Promise<PackageLoadResult> {
    try {
      this.paths.assertSlug(slug);
    } catch {
      return { slug, ok: false, error: 'Invalid slug' };
    }

    const row = await this.registry.getBySlug(slug);
    if (!row) return { slug, ok: false, error: 'Not installed' };
    if (String(row.status ?? '') !== 'enabled') {
      return { slug, ok: false, skipped: true, reason: 'not_enabled' };
    }

    const moduleRoot = this.paths.moduleRoot(slug);
    if (!fs.existsSync(moduleRoot)) {
      await this.quarantine(slug, 'Module directory missing');
      return { slug, ok: false, error: 'Module directory missing' };
    }

    const manifest = readManifest(moduleRoot);
    if (!manifest) {
      await this.quarantine(slug, 'module.json missing or invalid');
      return { slug, ok: false, error: 'module.json missing or invalid' };
    }

    const entry = resolveNodeEntrypoint(moduleRoot, manifest);
    let state = this.loaded.get(slug);
    if (!state) {
      state = {
        active: false,
        routesRegistered: false,
        entryPath: entry,
        routeKeys: [],
        subscriptions: [],
      };
      this.loaded.set(slug, state);
    }
    state.entryPath = entry;

    this.clearSubscriptions(slug);
    this.clearRouteKeys(slug);
    clearPackageOwnership(slug);
    state.active = false;

    const manifestSurfaces = manifest.surfaces;
    if (manifestSurfaces && typeof manifestSurfaces === 'object' && !Array.isArray(manifestSurfaces)) {
      PackageSurfaceRegistry.register(slug, manifestSurfaces as PackageSurfaces);
    }

    if (!entry) {
      state.active = true;
      return { slug, ok: true, skipped: true, reason: 'no_node_entrypoint' };
    }

    const ctx = createPlatformContext({
      db: this.opts.db,
      events: this.opts.events,
      cfg: this.opts.cfg,
      slug,
      app: this.opts.app,
      apiPrefixes: this.opts.apiPrefixes,
      isActive: () => this.isActive(slug),
      routes: this.routes,
      auth: this.opts.auth,
      crud: this.opts.crud,
      onRouteRegistered: (method, fullPath) => {
        state!.routeKeys.push(`${method} ${fullPath}`);
      },
      onSubscribe: (event, fn) => {
        state!.subscriptions.push({ event, fn });
      },
    });

    try {
      await this.invokeEntry(entry, ctx);
      state.active = true;
      state.routesRegistered = true;
      await this.registry.setStatus(slug, 'enabled', null, 'ok');
      return { slug, ok: true };
    } catch (e) {
      state.active = false;
      this.clearRouteKeys(slug);
      clearPackageOwnership(slug);
      const msg = e instanceof Error ? e.message : String(e);
      await this.quarantine(slug, `Node entry failed: ${msg}`);
      return { slug, ok: false, error: msg };
    }
  }

  async unload(slug: string): Promise<void> {
    const state = this.loaded.get(slug);
    if (state) state.active = false;
    this.clearSubscriptions(slug);
    this.clearRouteKeys(slug);
    clearPackageOwnership(slug);
  }

  private clearSubscriptions(slug: string): void {
    const state = this.loaded.get(slug);
    if (!state) return;
    for (const sub of state.subscriptions) {
      this.opts.events.unsubscribe(sub.event, sub.fn);
    }
    state.subscriptions = [];
  }

  private clearRouteKeys(slug: string): void {
    const state = this.loaded.get(slug);
    if (!state) return;
    for (const key of state.routeKeys) {
      this.routeHandlers.delete(key);
    }
    state.routeKeys = [];
  }

  private async quarantine(slug: string, message: string): Promise<void> {
    await this.registry.setStatus(slug, 'failed', message, 'quarantined');
    await this.registry.mirrorPluginEnabled(slug, false);
    await this.unload(slug);
  }

  private async invokeEntry(entryAbs: string, ctx: PlatformContext): Promise<void> {
    this.paths.assertContained(this.paths.moduleRoot(ctx.slug()), entryAbs);
    const url = `${pathToFileURL(entryAbs).href}?t=${Date.now()}`;
    const mod = (await import(url)) as Record<string, unknown>;
    await invokePackageEntry(mod, ctx);
  }
}
