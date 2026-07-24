import { createElement } from 'react'
import { registerModule } from '@/core/moduleRegistry'
import { NotificationsPage } from './NotificationsPage'

registerModule({
  name: 'notifications',
  label: 'Уведомления',
  adminNav: [{ group: 'Коммуникации', path: '/admin/notifications', label: 'Уведомления', permission: 'notifications.view', icon: 'bell' }],
  adminScreens: [{ path: 'notifications', label: 'Уведомления', group: 'Коммуникации', element: createElement(NotificationsPage) }],
})
