import { createElement } from 'react'
import { registerModule } from '@/core/moduleRegistry'
import { AutomationAdminPage } from './AutomationAdminPage'

registerModule({
  name: 'automation',
  label: 'Автоматизация',
  adminNav: [{ group: 'Система', path: '/admin/automations', label: 'Автоматизация', permission: 'automations.view', icon: 'workflow' }],
  adminScreens: [{ path: 'automations', label: 'Автоматизация', group: 'Система', element: createElement(AutomationAdminPage) }],
})
