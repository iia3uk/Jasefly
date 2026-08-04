/**
 * Prebuilt stub for package install tests (no separate FE build).
 * Contract: export default { slug, version, register(ctx) }.
 */
export const JaseflyFrontendModule = {
  slug: 'demo-kit',
  version: '1.1.0',
  sdkVersion: 1,
  async register(ctx) {
    const nav = {
      group: 'Разработка',
      path: '/admin/demo-kit',
      label: 'Demo Kit',
      permission: 'demo-kit.view',
      icon: 'package',
    }
    const page = {
      path: 'demo-kit',
      label: 'Demo Kit',
      group: 'Разработка',
      permission: 'demo-kit.view',
    }
    if (ctx.admin?.registerNavItem) {
      ctx.admin.registerNavItem(nav)
      ctx.admin.registerPage(page)
    } else {
      ctx.registerAdminNavItem?.(nav)
      ctx.registerAdminRoute?.(page)
    }
  },
}

export default JaseflyFrontendModule
