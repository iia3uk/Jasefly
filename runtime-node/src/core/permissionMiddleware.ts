import type { MiddlewareHandler } from 'hono';
import type { AuthService } from '../auth/AuthService.js';
import { fail } from '../http/envelope.js';

/** Parity with PHP PermissionService::contentResources(). */
export const CONTENT_RESOURCES = [
  'social-links',
  'statistics',
  'experience',
  'education',
  'skill-categories',
  'skills',
  'blog-categories',
  'blog-tags',
  'testimonials',
  'navigation',
  'homepage-sections',
  'pages',
  'services',
  'projects',
  'project-categories',
  'blog',
] as const;

const CONTENT_UPDATE_ANY = [
  'content.update',
  'content.edit_any',
  'content.edit_own',
  'pages.manage',
] as const;

const CONTENT_CREATE_ANY = ['content.create', 'pages.manage'] as const;
const CONTENT_DELETE_ANY = [
  'content.delete',
  'content.delete_any',
  'content.delete_own',
  'pages.manage',
] as const;
const CONTENT_PUBLISH_ANY = [
  'content.publish',
  'content.publish_own',
  'pages.manage',
  ...CONTENT_UPDATE_ANY,
] as const;

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
  if (p.includes('/admin/activity')) return 'activity.view';
  if (p.includes('/admin/system') || p.includes('/admin/dashboard') || p.includes('/admin/scheduler')) {
    return 'system.manage';
  }
  if (p.includes('/admin/')) return null;
  return null;
}

/** Explicit content / webhook mutation capabilities (Auth alone is insufficient). */
export function mutationCapabilitiesFor(method: string, path: string): readonly string[] | null {
  const m = method.toUpperCase();
  const p = path.includes('/api/') ? path.replace(/^\/api\/v\d+/, '') : path;

  if (p.includes('/admin/webhooks') && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(m)) {
    return ['integrations.manage'];
  }
  if (m === 'POST' && /\/admin\/pages\/revisions\/\d+\/restore$/.test(p)) {
    return CONTENT_UPDATE_ANY;
  }
  if (m === 'POST' && /\/admin\/pages\/\d+\/revisions$/.test(p)) {
    return CONTENT_UPDATE_ANY;
  }
  if (m === 'POST' && /\/admin\/pages\/\d+\/copy-layout$/.test(p)) {
    return CONTENT_UPDATE_ANY;
  }

  const resAlt = CONTENT_RESOURCES.map((r) => r.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  if (new RegExp(`^/admin/(${resAlt})$`).test(p) && m === 'POST') return CONTENT_CREATE_ANY;
  if (new RegExp(`^/admin/(${resAlt})/reorder$`).test(p)) return CONTENT_UPDATE_ANY;
  if (new RegExp(`^/admin/(${resAlt})/\\d+/publish$`).test(p)) return CONTENT_PUBLISH_ANY;
  if (new RegExp(`^/admin/(${resAlt})/\\d+$`).test(p) && (m === 'PUT' || m === 'PATCH')) {
    return CONTENT_UPDATE_ANY;
  }
  if (new RegExp(`^/admin/(${resAlt})/\\d+$`).test(p) && m === 'DELETE') return CONTENT_DELETE_ANY;
  return null;
}

function hasCapability(caps: string[], needed: string): boolean {
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

function hasAnyCapability(caps: string[], needed: readonly string[]): boolean {
  return needed.some((n) => hasCapability(caps, n));
}

export function requirePermission(auth: AuthService, capability?: string): MiddlewareHandler {
  return async (c, next) => {
    const user = await auth.meFromBearer(c.req.header('authorization'), c);
    if (!user) return fail(c, 'Unauthorized', 401);
    c.set('user', user);
    if (user === 'mcp') {
      await next();
      return;
    }
    const payload = await auth.mePayload(user);
    const caps = payload.capabilities || [];

    if (capability) {
      if (hasCapability(caps, capability)) {
        await next();
        return;
      }
      return fail(c, 'Forbidden', 403);
    }

    const pathCap = capabilityForAdminPath(c.req.path);
    if (pathCap !== null) {
      if (!hasCapability(caps, pathCap)) {
        return fail(c, 'Forbidden', 403);
      }
    }

    const mutationCaps = mutationCapabilitiesFor(c.req.method, c.req.path);
    if (mutationCaps !== null && !hasAnyCapability(caps, mutationCaps)) {
      return fail(c, 'Forbidden', 403);
    }

    await next();
  };
}
