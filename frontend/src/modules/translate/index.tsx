import { createElement } from 'react'
import { registerModule } from '@/core/moduleRegistry'
import { TranslatePage } from '@/admin/pages/TranslatePage'

registerModule({
  name: 'translate',
  label: 'Переводчик сайта',
  adminNav: [
    {
      group: 'Сайт',
      path: '/admin/translate',
      label: 'Переводчик',
      permission: 'settings.manage',
      icon: 'globe',
    },
  ],
  adminScreens: [
    { path: 'translate', label: 'Переводчик', group: 'Сайт', element: createElement(TranslatePage) },
  ],
})
