import { createElement } from 'react'
import { registerModule } from '@/core/moduleRegistry'
import { OrdersAdminPage } from './OrdersAdminPage'

registerModule({
  name: 'orders',
  label: 'Заказы',
  adminNav: [{ group: 'Коммерция', path: '/admin/orders', label: 'Заказы', permission: 'orders.view', icon: 'shopping-cart' }],
  adminScreens: [{ path: 'orders', label: 'Заказы', group: 'Коммерция', element: createElement(OrdersAdminPage) }],
})
