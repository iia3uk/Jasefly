/**
 * Dispatch package-owned HTTP routes from a mutable table.
 * Supports Hono-style `:param` segments (exact key first, then pattern match).
 */
import type { Context, Next } from 'hono';
import type { PackageHttpHandler, PackageRouteTable } from '../platform/sdk.js';

function matchPattern(pattern: string, pathname: string): Record<string, string> | null {
  const pParts = pattern.split('/').filter((x) => x.length > 0);
  const uParts = pathname.split('/').filter((x) => x.length > 0);
  if (pParts.length !== uParts.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < pParts.length; i++) {
    const pp = pParts[i]!;
    const up = uParts[i]!;
    if (pp.startsWith(':')) {
      params[pp.slice(1)] = decodeURIComponent(up);
    } else if (pp !== up) {
      return null;
    }
  }
  return params;
}

function parseKey(key: string): { method: string; pattern: string } | null {
  const sp = key.indexOf(' ');
  if (sp <= 0) return null;
  return { method: key.slice(0, sp), pattern: key.slice(sp + 1) };
}

export type IterableRouteTable = PackageRouteTable & {
  entries(): IterableIterator<[string, PackageHttpHandler]>;
};

export function packageRouteDispatcher(routes: PackageRouteTable) {
  const table = routes as IterableRouteTable;
  return async (c: Context, next: Next) => {
    const pathname = new URL(c.req.url).pathname;
    const method = c.req.method.toUpperCase();
    const exactKey = `${method} ${pathname}`;
    let handler: PackageHttpHandler | undefined = routes.get(exactKey);
    let params: Record<string, string> = {};

    if (!handler && typeof table.entries === 'function') {
      for (const [key, h] of table.entries()) {
        const parsed = parseKey(key);
        if (!parsed || parsed.method !== method) continue;
        if (!parsed.pattern.includes(':')) continue;
        const matched = matchPattern(parsed.pattern, pathname);
        if (matched) {
          handler = h;
          params = matched;
          break;
        }
      }
    }

    if (!handler) {
      await next();
      return;
    }

    if (Object.keys(params).length > 0) {
      const req = c.req as unknown as {
        param: (key?: string) => string | Record<string, string>;
      };
      const prev = req.param.bind(req);
      req.param = ((key?: string) => {
        if (key === undefined) {
          const base = (prev() as Record<string, string>) || {};
          return { ...base, ...params };
        }
        if (key in params) return params[key]!;
        return prev(key) as string;
      }) as typeof req.param;
    }

    return handler(c);
  };
}
