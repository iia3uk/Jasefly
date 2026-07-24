/**
 * Client-side mirror of backend role_permissions (018_harden_role_permissions).
 * Used to hide nav / gate screens; API remains the source of truth.
 */

export type StaffRole = 'super_admin' | 'admin' | 'editor'

const ADMIN_PERMS = [
  'content.view',
  'content.create',
  'content.update',
  'content.delete',
  'content.publish',
  'content.restore',
  'content.force_delete',
  'media.manage',
  'settings.manage',
  'users.manage',
  'activity.view',
  'commerce.manage',
  'integrations.manage',
  'support.manage',
  'support.agent',
  'lab.view',
  'lab.create',
  'lab.update',
  'lab.delete',
  'lab.publish',
  'lab.preview',
] as const

const EDITOR_PERMS = [
  'content.view',
  'content.create',
  'content.update',
  'content.delete',
  'content.publish',
  'media.manage',
  'lab.view',
  'lab.preview',
] as const

/** '*' = all permissions (super_admin). */
export const ROLE_PERMISSIONS: Record<StaffRole, readonly string[] | '*'> = {
  super_admin: '*',
  admin: ADMIN_PERMS,
  editor: EDITOR_PERMS,
}

export function roleCan(role: string | null | undefined, permission: string): boolean {
  if (!role) return false
  const perms = ROLE_PERMISSIONS[role as StaffRole]
  if (!perms) return false
  if (perms === '*') return true
  return perms.includes(permission)
}

export function isSuperAdminRole(role: string | null | undefined): boolean {
  return role === 'super_admin'
}

/** Map first admin path segment → required permission (null = any staff). */
export function permissionForAdminSegment(segment: string): string | null {
  const map: Record<string, string> = {
    plugins: 'system.manage',
    backup: 'system.manage',
    updates: 'system.manage',
    system: 'system.manage',
    ddos: 'system.manage',
    'content-pack': 'system.manage',
    users: 'users.manage',
    activity: 'activity.view',
    trash: 'content.restore',
    password: 'settings.manage',
    seo: 'settings.manage',
    'site-settings': 'settings.manage',
    theme: 'settings.manage',
    'email-settings': 'settings.manage',
  redirects: 'settings.manage',
  mail: 'settings.manage',
  translate: 'settings.manage',
  media: 'media.manage',
    orders: 'commerce.manage',
    webhooks: 'integrations.manage',
    support: 'support.agent',
    lab: 'lab.view',
  }
  return map[segment] ?? null
}
