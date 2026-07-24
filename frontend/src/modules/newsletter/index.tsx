import { createElement } from 'react'
import { registerModule } from '@/core/moduleRegistry'
import { NewsletterCampaignsPage, NewsletterSubscribersPage } from './NewsletterAdminPages'

registerModule({
  name: 'newsletter',
  label: 'Рассылки',
  adminNav: [
    { group: 'Коммуникации', path: '/admin/newsletter/subscribers', label: 'Подписчики', permission: 'newsletter.view', icon: 'users' },
    { group: 'Коммуникации', path: '/admin/newsletter/campaigns', label: 'Рассылки', permission: 'newsletter.view', icon: 'send' },
  ],
  adminScreens: [
    { path: 'newsletter/subscribers', label: 'Подписчики', group: 'Коммуникации', element: createElement(NewsletterSubscribersPage) },
    { path: 'newsletter/campaigns', label: 'Рассылки', group: 'Коммуникации', element: createElement(NewsletterCampaignsPage) },
  ],
})
