import { createElement } from 'react'
import { registerModule } from '@/core/moduleRegistry'
import { SchedulerPage } from '@/admin/pages/SchedulerPage'

registerModule({
  name: 'scheduler',
  label: 'Планировщик',
  adminNav: [
    {
      group: 'Система',
      path: '/admin/scheduler',
      label: 'Планировщик',
      permission: 'scheduler.view',
      icon: 'activity',
    },
  ],
  adminScreens: [
    { path: 'scheduler', label: 'Планировщик', group: 'Система', element: createElement(SchedulerPage) },
  ],
})
