/**
 * User Groups — admin stub (Access Provider group).
 * Hand-written ESM; uses host ctx.ui when available.
 */
const SLUG = 'user-groups'
const VERSION = '0.1.0'

function AdminPage({ ui }) {
  const h = ui.createElement
  return h(
    'div',
    { className: 'p-6 space-y-3 max-w-2xl' },
    h('h1', { className: 'text-xl font-semibold' }, 'Группы пользователей'),
    h(
      'p',
      { className: 'text-sm text-zinc-500' },
      'Каркас Access Provider «group» (assert member_of). Полный CRUD групп — в следующих релизах. Билдер использует только Access Container / AccessService.',
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
      group: 'Пользователи',
      path: '/admin/user-groups',
      label: 'Группы',
      permission: 'user-groups.view',
      icon: 'users',
    }
    const page = {
      path: 'user-groups',
      label: 'Группы',
      group: 'Пользователи',
      permission: 'user-groups.view',
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
