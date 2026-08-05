import type { MiddlewareHandler } from 'hono';
import type { AuthService } from '../auth/AuthService.js';
import { fail } from '../http/envelope.js';

/**
 * Path → capability map (parity subset of PHP PermissionService::capabilityForAdminPath).
 */
export function capabilityForAdminPath(path: string): string | null {
  const p = path.includes('/api/') ? path.replace(/^\/api\/v\d+/, '') : path;
  if (p.includes('/admin/plugins')) return 'plugins.manage';
  if (p.includes('/admin/mcp')) return 'mcp.manage';
  if (p.includes('/admin/updates') || p.includes('/admin/backup')) return 'system.updates';
  if (p.includes('/admin/access/bootstrap') || p.includes('/admin/access/batch-can')) return 'dashboard.view';
  if (p.includes('/admin/access')) return 'access.manage';
  if (p.includes('/admin/roles') || p.includes('/admin/permissions')) return 'roles.manage';
  if (p.includes('/admin/users')) return 'users.view';
  if (p.includes('/admin/modules')) return 'modules.view';
  if (p.includes('/admin/media')) return 'media.manage';
  if (p.includes('/admin/seo')) return 'seo.manage';
  if (p.includes('/admin/system') || p.includes('/admin/dashboard') || p.includes('/admin/scheduler')) {
    return 'system.manage';
  }
  if (p.includes('/admin/')) return null; // handler-local / content.* via requireAdmin role for now
  return null;
}

export function requirePermission(auth: AuthService, capability?: string): MiddlewareHandler {
  return async (c, next) => {
    const user = await auth.meFromBearer(c.req.header('authorization'));
    if (!user) return fail(c, 'Unauthorized', 401);
    c.set('user', user);
    if (user === 'mcp') {
      await next();
      return;
    }
    const needed = capability ?? capabilityForAdminPath(c.req.path);
    if (!needed) {
      await next();
      return;
    }
    const payload = await auth.mePayload(user);
    const caps = (payload.capabilities as string[]) || [];
    if (caps.includes('*') || caps.includes(needed)) {
      await next();
      return;
    }
    return fail(c, 'Forbidden', 403);
  };
}
