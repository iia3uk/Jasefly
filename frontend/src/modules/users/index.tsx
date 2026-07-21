import { createElement } from 'react'
import { registerModule } from '@/core/moduleRegistry'
import { UsersPage, RolesPage } from '@/admin/pages/UsersPages'

registerModule({
  name: 'users',
  label: 'Пользователи',
  adminNav: [
    { group: 'Пользователи', path: '/admin/users', label: 'Пользователи', permission: 'users.manage', icon: 'users' },
  ],
  adminScreens: [
    { path: 'users', label: 'Пользователи', group: 'Система', element: createElement(UsersPage) },
    { path: 'roles', label: 'Роли и права', group: 'Система', element: createElement(RolesPage) },
  ],
})
