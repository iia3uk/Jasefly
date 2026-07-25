/**
 * Prebuilt stub for package install tests (no separate FE build).
 * Contract: export default { slug, version, register(ctx) }.
 */
export const JaseflyFrontendModule = {
  slug: 'demo-kit',
  version: '1.0.0',
  async register(ctx) {
    ctx.registerAdminNavItem({
      group: 'Разработка',
      path: '/admin/demo-kit',
      label: 'Demo Kit',
      permission: 'demo-kit.view',
      icon: 'package',
    })
    ctx.registerAdminRoute({
      path: 'demo-kit',
      label: 'Demo Kit',
      group: 'Разработка',
      permission: 'demo-kit.view',
    })
  },
}

export default JaseflyFrontendModule
