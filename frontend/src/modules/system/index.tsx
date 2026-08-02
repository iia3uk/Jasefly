import { createElement } from 'react'
import { registerModule } from '@/core/moduleRegistry'
import { TrashPage, ActivityPage, SystemStatusPage } from '@/admin/pages/EnterprisePages'
import { BackupPage, PasswordPage, UpdatesPage } from '@/admin/pages/UtilityPages'
import { SingletonPage } from '@/admin/pages/SitePages'
import { PluginsPage } from '@/admin/pages/PluginsPage'
import { RedirectsPage } from '@/admin/pages/RedirectsPage'

// Core CMS system module — owns platform-level admin screens.
// The portfolio plugin registers its own items separately.
registerModule({
  name: 'system',
  label: 'Система',
  adminNav: [
    { group: 'Система', path: '/admin/plugins', label: 'Плагины', permission: 'system.manage', icon: 'puzzle' },
    { group: 'Система', path: '/admin/system', label: 'Состояние системы', permission: 'system.manage', icon: 'heart' },
    { group: 'Система', path: '/admin/updates', label: 'Обновление CMS', permission: 'system.manage', icon: 'refresh-cw' },
    { group: 'Система', path: '/admin/activity', label: 'Журнал действий', permission: 'activity.view', icon: 'activity' },
    { group: 'Система', path: '/admin/trash', label: 'Корзина', permission: 'content.restore', icon: 'trash' },
    { group: 'Система', path: '/admin/backup', label: 'Резервные копии', permission: 'system.manage', icon: 'database' },
    { group: 'Система', path: '/admin/password', label: 'Пароль и 2FA', permission: 'settings.manage', icon: 'key' },
    { group: 'Система', path: '/admin/site-settings', label: 'Настройки сайта', permission: 'settings.manage', icon: 'settings' },
  ],
  adminScreens: [
    { path: 'activity', label: 'Журнал действий', group: 'Система', element: createElement(ActivityPage) },
    { path: 'system', label: 'Состояние системы', group: 'Система', element: createElement(SystemStatusPage) },
    { path: 'updates', label: 'Обновление CMS', group: 'Система', element: createElement(UpdatesPage) },
    { path: 'plugins', label: 'Плагины', group: 'Система', element: createElement(PluginsPage) },
    { path: 'trash', label: 'Корзина', group: 'Система', element: createElement(TrashPage) },
    { path: 'seo', label: 'SEO', group: 'Система', element: createElement(SingletonPage, { path: 'seo', title: 'SEO-настройки' }) },
    { path: 'redirects', label: 'Редиректы', group: 'Система', element: createElement(RedirectsPage) },
    { path: 'site-settings', label: 'Сайт', group: 'Система', element: createElement(SingletonPage, { path: 'site-settings', title: 'Настройки сайта' }) },
    { path: 'backup', label: 'Резервные копии', group: 'Система', element: createElement(BackupPage) },
    { path: 'password', label: 'Пароль и 2FA', group: 'Система', element: createElement(PasswordPage) },
  ],
})
