import { createElement } from 'react'
import { registerModule } from '@/core/moduleRegistry'
import { OverloadPage } from '@/admin/pages/OverloadPage'

registerModule({
  name: 'overload',
  label: 'Защита от перегрузок',
  adminNav: [
    {
      group: 'Система',
      path: '/admin/overload',
      label: 'Перегрузки',
      permission: 'system.manage',
      icon: 'activity',
    },
  ],
  adminScreens: [
    { path: 'overload', label: 'Перегрузки', group: 'Система', element: createElement(OverloadPage) },
  ],
})
