/**
 * Minimal PlatformContext type for package TypeScript (no host imports).
 * Runtime object is injected by PackageLoader — this is compile-time only.
 */
import type { Context } from 'hono';

export type PackageHttpHandler = (c: Context) => Response | Promise<Response>;
export type PackageMiddleware = (
  c: Context,
  next: () => Promise<void>,
) => Promise<Response | void> | Response | void;

export type PlatformContext = {
  slug(): string;
  runtime(): 'node-vps';
  database(): {
    tableExists(t: string): Promise<boolean>;
    columns(t: string): Promise<string[]>;
    all(sql: string, params?: unknown[]): Promise<Record<string, unknown>[]>;
    one(sql: string, params?: unknown[]): Promise<Record<string, unknown> | null>;
    run(sql: string, params?: unknown[]): Promise<unknown>;
    lastInsertId(): Promise<number>;
    driver(): string;
  };
  events(): {
    subscribe(
      event: string,
      handler: (payload: Record<string, unknown>) => void | Promise<void>,
      priority?: number,
    ): void;
    publish(event: string, payload?: Record<string, unknown>): Promise<void>;
    declare(eventId: string, meta?: Record<string, unknown>): void;
    hasDeclared(eventId: string): boolean;
  };
  http(): {
    apiPrefix(): string;
    get(path: string, ...handlers: Array<PackageMiddleware | PackageHttpHandler>): void;
    post(path: string, ...handlers: Array<PackageMiddleware | PackageHttpHandler>): void;
    put(path: string, ...handlers: Array<PackageMiddleware | PackageHttpHandler>): void;
    delete(path: string, ...handlers: Array<PackageMiddleware | PackageHttpHandler>): void;
    patch(path: string, ...handlers: Array<PackageMiddleware | PackageHttpHandler>): void;
    fetch(
      url: string,
      opts?: { method?: string; headers?: Record<string, string>; body?: string; timeoutMs?: number },
    ): Promise<Response>;
    ok(c: Context, data: unknown, status?: number): Response;
    fail(c: Context, error: string, status?: number, errors?: unknown, extra?: Record<string, unknown>): Response;
    auth(): PackageMiddleware;
    admin(): PackageMiddleware;
    permission(cap: string): PackageMiddleware;
    permissionAny(caps: string[]): PackageMiddleware;
    softRateLimit(opts: { max: number; windowMs: number }): PackageMiddleware;
  };
  capabilities(): {
    has(cap: string): boolean;
    provide(cap: string): void;
  };
  scheduler(): {
    registerHandler(type: string, handler: (payload: Record<string, unknown>) => void | Promise<void>): void;
  };
  jobs(): {
    registerHandler(type: string, handler: (payload: Record<string, unknown>) => void | Promise<void>): void;
  };
  mail(): { send(opts: { to: string; subject: string; body?: string; html?: string }): Promise<{ ok: boolean }> };
  notifications(): {
    send(opts: { user_id?: number; title: string; body?: string; type?: string }): Promise<{ ok: boolean }>;
  };
  settings(): {
    get(): Promise<Record<string, unknown>>;
    get(key: string, defaultValue?: unknown): Promise<unknown>;
    set(patch: Record<string, unknown>): Promise<void>;
    set(key: string, value: unknown): Promise<void>;
    all(): Promise<Record<string, unknown>>;
    getModule(moduleSlug: string): Promise<Record<string, unknown>>;
    getModule(moduleSlug: string, key: string, defaultValue?: unknown): Promise<unknown>;
  };
  storage(): {
    root(): string;
    read(relPath: string): string | null;
    write(relPath: string, data: string | Buffer): void;
  };
  passwords(): {
    hash(password: string): Promise<string>;
    verify(password: string, hash: string): Promise<boolean>;
  };
  plugins(): {
    isEnabled(moduleSlug?: string): Promise<boolean>;
    softGate(c: Context, method: string, isItem: boolean, moduleSlug?: string): Promise<Response | null>;
  };
  adminResources(): null | {
    list(c: Context, resource: string): Promise<Response>;
    show(c: Context, resource: string, id: string): Promise<Response>;
    create(c: Context, resource: string): Promise<Response>;
    update(c: Context, resource: string, id: string): Promise<Response>;
    remove(c: Context, resource: string, id: string): Promise<Response>;
    publish(c: Context, resource: string, id: string): Promise<Response>;
    reorder(c: Context, resource: string): Promise<Response>;
  };
  config(): {
    get(key: string, defaultValue?: unknown): unknown;
    cmsVersion(): string;
    sdkVersion(): number;
    runtime(): 'node-vps';
    env(): string;
    url(): string;
    name(): string;
  };
};
