import { createElement } from 'react'
import { registerModule } from '@/core/moduleRegistry'
import { DdosPage } from '@/admin/pages/DdosPage'

registerModule({
  name: 'ddos',
  label: 'DDoS защита',
  adminNav: [
    { group: 'DDoS защита', path: '/admin/ddos', label: 'DDoS защита', permission: 'system.manage', icon: 'shield' },
  ],
  adminScreens: [
    { path: 'ddos', label: 'DDoS защита', group: 'Система', element: createElement(DdosPage) },
  ],
})
