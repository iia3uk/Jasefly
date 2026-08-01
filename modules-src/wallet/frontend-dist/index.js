/**
 * Wallet — admin stub (Access Provider wallet).
 */
const SLUG = 'wallet'
const VERSION = '0.1.0'

function AdminPage({ ui }) {
  const h = ui.createElement
  return h(
    'div',
    { className: 'p-6 space-y-3 max-w-2xl' },
    h('h1', { className: 'text-xl font-semibold' }, 'Кошелёк'),
    h(
      'p',
      { className: 'text-sm text-zinc-500' },
      'Каркас Access Provider «wallet» (assert min_balance). Пополнение и UI — позже. В билдере только правило AccessService.',
    ),
  )
}

export const JaseflyFrontendModule = {
  slug: SLUG,
  version: VERSION,
  sdkVersion: 1,
  async register(ctx) {
    const ui = ctx.ui
    const nav = {
      group: 'Коммерция',
      path: '/admin/wallet',
      label: 'Кошелёк',
      permission: 'wallet.view',
      icon: 'wallet',
    }
    const page = {
      path: 'wallet',
      label: 'Кошелёк',
      group: 'Коммерция',
      permission: 'wallet.view',
      element: ui?.createElement ? ui.createElement(AdminPage, { ui }) : null,
    }
    if (ctx.admin?.registerNavItem) {
      ctx.admin.registerNavItem(nav)
      ctx.admin.registerPage?.(page)
    } else {
      ctx.registerAdminNavItem?.(nav)
      ctx.registerAdminRoute?.(page)
    }
  },
}

export default JaseflyFrontendModule
