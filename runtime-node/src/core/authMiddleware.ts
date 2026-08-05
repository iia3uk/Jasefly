import type { MiddlewareHandler } from 'hono';
import type { AuthService } from '../auth/AuthService.js';
import { fail } from '../http/envelope.js';

export type AuthVars = {
  user: Awaited<ReturnType<AuthService['meFromBearer']>>;
};

export function requireAuth(auth: AuthService): MiddlewareHandler {
  return async (c, next) => {
    const user = await auth.meFromBearer(c.req.header('authorization'));
    if (!user) return fail(c, 'Unauthorized', 401);
    c.set('user', user);
    await next();
  };
}

const ADMIN_ROLES = new Set(['admin', 'super_admin', 'editor']);

/** Auth + role gate for admin API (permission matrix parity incomplete; blocks anonymous/user). */
export function requireAdmin(auth: AuthService): MiddlewareHandler {
  return async (c, next) => {
    const user = await auth.meFromBearer(c.req.header('authorization'));
    if (!user) return fail(c, 'Unauthorized', 401);
    if (user === 'mcp') {
      c.set('user', user);
      await next();
      return;
    }
    const role = String((user as { role?: string }).role ?? '');
    if (!ADMIN_ROLES.has(role)) return fail(c, 'Forbidden', 403);
    c.set('user', user);
    await next();
  };
}
