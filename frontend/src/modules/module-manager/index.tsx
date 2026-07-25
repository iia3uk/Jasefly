import { createElement } from 'react'
import { registerModule } from '@/core/moduleRegistry'
import { ModulesPage } from '@/admin/pages/ModulesPage'

registerModule({
  name: 'module-manager',
  label: 'Модули',
  adminNav: [
    {
      group: 'Система',
      path: '/admin/modules',
      label: 'Модули',
      permission: 'modules.view',
      icon: 'package',
    },
  ],
  adminScreens: [
    { path: 'modules', label: 'Модули', group: 'Система', element: createElement(ModulesPage) },
  ],
})
