/**
 * Automation package FE — host admin page via hostPageKey.
 * Triggers load from GET /admin/automations/triggers (EventCatalog); no product whitelist.
 */
const SLUG = 'automation'
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
      path: 'automations',
      label: 'Автоматизация',
      group: 'Система',
      permission: 'automations.view',
      hostPageKey: 'automation.admin',
      icon: 'workflow',
    })
    void ui
  },
  async unregister() {},
}

export default JaseflyFrontendModule
