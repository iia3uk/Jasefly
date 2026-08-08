/**
 * Notifications package FE — host admin page + header bell slot.
 */
const SLUG = 'notifications'
const VERSION = '1.0.0'

function registerHostAdminPage(ctx, spec) {
  const { path, label, group, permission, hostPageKey, icon } = spec
  const nav = { group, path: `/admin/${path}`, label, permission, icon }
  const Comp = ctx.admin?.resolveHostPage?.(hostPageKey)
  const page = {
    path,
    label,
    group,
    permission,
    hostPageKey,
    ...(Comp ? { Component: Comp } : {}),
  }
  if (ctx.admin?.registerNavItem) {
    ctx.admin.registerNavItem(nav)
    ctx.admin.registerPage?.(page)
  } else {
    ctx.registerAdminNavItem?.(nav)
    ctx.registerAdminRoute?.(page)
  }
}

const JaseflyFrontendModule = {
  slug: SLUG,
  version: VERSION,
  async register(ctx) {
    const ui = ctx.ui || {}
    registerHostAdminPage(ctx, {
      path: 'notifications',
      label: 'Уведомления',
      group: 'Коммуникации',
      permission: 'notifications.view',
      hostPageKey: 'notifications.admin',
      icon: 'bell',
    })
    const Bell = ctx.admin?.resolveHostPage?.('notifications.bell')
    if (Bell && ctx.host?.registerSlot) {
      ctx.host.registerSlot(
        'admin.header',
        () => ui.createElement(Bell),
        { id: 'bell', order: 20 },
      )
    }
  },
  async unregister() {},
}

export default JaseflyFrontendModule
