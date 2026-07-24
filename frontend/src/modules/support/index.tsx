import { createElement } from 'react'
import { registerModule } from '@/core/moduleRegistry'
import { SupportInboxPage } from '@/admin/pages/SupportInboxPage'
import { SupportFaqPage } from '@/admin/pages/SupportFaqPage'

registerModule({
  name: 'support',
  label: 'Поддержка',
  adminNav: [
    {
      group: 'Коммуникации',
      path: '/admin/support',
      label: 'Поддержка',
      permission: 'support.agent',
      icon: 'message-circle',
    },
    {
      group: 'Коммуникации',
      path: '/admin/support/faq',
      label: 'FAQ бота',
      permission: 'support.manage',
      icon: 'help-circle',
    },
  ],
  adminScreens: [
    { path: 'support', label: 'Поддержка', group: 'Коммуникации', element: createElement(SupportInboxPage) },
    { path: 'support/faq', label: 'FAQ бота', group: 'Коммуникации', element: createElement(SupportFaqPage) },
  ],
})
