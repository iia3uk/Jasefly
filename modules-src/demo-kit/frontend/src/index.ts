import { createElement, type ReactElement } from 'react'
import { DemoAdminPage } from './DemoAdminPage'

/** Host injects this shape via dynamic import of frontend-dist. */
export type ModuleFrontendContext = {
  slug: string
  version: string
  registerAdminRoute: (screen: {
    path: string
    label: string
    group: string
    permission?: string
    element?: ReactElement
  }) => void
  registerAdminNavItem: (item: {
    group: string
    path: string
    label: string
    permission?: string
    icon?: string
  }) => void
}

export const JaseflyFrontendModule = {
  slug: 'demo-kit',
  version: '1.1.0',
  sdkVersion: 1,
  async register(ctx: ModuleFrontendContext & {
    admin?: {
      registerNavItem?: ModuleFrontendContext['registerAdminNavItem']
      registerPage?: ModuleFrontendContext['registerAdminRoute']
    }
  }) {
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
      element: createElement(DemoAdminPage),
    }
    if (ctx.admin?.registerNavItem) {
      ctx.admin.registerNavItem(nav)
      ctx.admin.registerPage?.(page)
    } else {
      ctx.registerAdminNavItem(nav)
      ctx.registerAdminRoute(page)
    }
  },
}

export default JaseflyFrontendModule
