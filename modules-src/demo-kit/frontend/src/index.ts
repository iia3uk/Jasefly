import { createElement, type ReactElement } from 'react'
import { DemoAdminPage } from './DemoAdminPage'

export type JaseflyFrontendModule = {
  name: string
  label: string
  adminNav?: Array<{
    group: string
    path: string
    label: string
    permission?: string
    icon?: string
  }>
  adminScreens?: Array<{
    path: string
    label: string
    group: string
    element: ReactElement
  }>
}

export const JaseflyFrontendModule: JaseflyFrontendModule = {
  name: 'demo-kit',
  label: 'Demo Kit',
  adminNav: [
    {
      group: 'Разработка',
      path: '/admin/demo-kit',
      label: 'Demo Kit',
      permission: 'demo-kit.view',
      icon: 'package',
    },
  ],
  adminScreens: [
    {
      path: 'demo-kit',
      label: 'Demo Kit',
      group: 'Разработка',
      element: createElement(DemoAdminPage),
    },
  ],
}

export default JaseflyFrontendModule
