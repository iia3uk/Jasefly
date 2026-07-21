import { createElement } from 'react'
import { registerModule } from '@/core/moduleRegistry'
import { SingletonPage, ThemeSettingsPage, HomepagePage, HomepageEditPage } from '@/admin/pages/SitePages'
import { ContactMessagesPage } from '@/admin/pages/UtilityPages'
import { PagesListPage } from '@/admin/pages/PagesAdmin'
import { CrudListPage, CrudEditPage } from '@/admin/pages/AdminPages'

// Core CMS site module — owns page builder, homepage, navigation, footer, contact.
registerModule({
  name: 'site',
  label: 'Сайт',
  adminNav: [
    { group: 'Сайт', path: '/admin/pages', label: 'Страницы', icon: 'layout-template' },
    { group: 'Сайт', path: '/admin/hero', label: 'Оформление', icon: 'panel-top' },
    { group: 'Сайт', path: '/admin/messages', label: 'Сообщения', icon: 'message-square' },
  ],
  adminScreens: [
    { path: 'pages', label: 'Страницы', group: 'Сайт', element: createElement(PagesListPage) },
    { path: 'hero', label: 'Hero-блок', group: 'Сайт', element: createElement(SingletonPage, { path: 'hero', title: 'Hero-блок' }) },
    { path: 'homepage', label: 'Главная', group: 'Сайт', element: createElement(HomepagePage) },
    { path: 'homepage/:id', label: 'Редактирование секции', group: 'Сайт', element: createElement(HomepageEditPage) },
    { path: 'navigation', label: 'Навигация', group: 'Сайт', element: createElement(CrudListPage, { resource: 'navigation' }) },
    { path: 'navigation/:id', label: 'Редактирование пункта', group: 'Сайт', element: createElement(CrudEditPage, { resource: 'navigation' }) },
    { path: 'footer', label: 'Подвал', group: 'Сайт', element: createElement(SingletonPage, { path: 'footer', title: 'Подвал' }) },
    { path: 'contact-info', label: 'Контакты', group: 'Сайт', element: createElement(SingletonPage, { path: 'contact-info', title: 'Контакты' }) },
    { path: 'messages', label: 'Сообщения', group: 'Сайт', element: createElement(ContactMessagesPage) },
    { path: 'theme', label: 'Шаблон сайта', group: 'Сайт', element: createElement(ThemeSettingsPage) },
  ],
})
