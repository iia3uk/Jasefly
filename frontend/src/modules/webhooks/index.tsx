import { createElement } from 'react'
import { registerModule } from '@/core/moduleRegistry'
import { CrudListPage, CrudEditPage } from '@/admin/pages/AdminPages'
import type { Blueprint } from '@/core/pluginTypes'

const webhooksBlueprint: Blueprint = {
  key: 'webhooks',
  table: 'webhooks',
  label: 'Webhooks',
  singleton: false,
  soft_delete: false,
  slug: false,
  seo: false,
  group: 'Интеграции',
  orderable: false,
  icon: 'webhook',
  columns: {
    event: { type: 'string', widget: 'text', label: 'Событие', required: true, default: '*', nullable: true, index: false, permission: null, visible: true, options: null, min: null, max: null, pattern: null, help: '* для всех событий' },
    url: { type: 'string', widget: 'url', label: 'URL', required: true, default: null, nullable: true, index: false, permission: null, visible: true, options: null, min: null, max: null, pattern: null, help: null },
    secret: { type: 'string', widget: 'text', label: 'Секрет', required: false, default: null, nullable: true, index: false, permission: null, visible: true, options: null, min: null, max: null, pattern: null, help: null },
    is_active: { type: 'bool', widget: 'toggle', label: 'Активен', required: false, default: true, nullable: true, index: false, permission: null, visible: true, options: null, min: null, max: null, pattern: null, help: null },
  },
  indexes: [],
  permissions: ['integrations.manage'],
}

// Webhooks integration plugin — outbound webhook subscriptions.
registerModule({
  name: 'webhooks',
  label: 'Webhooks',
  adminNav: [{ group: 'Webhooks', path: '/admin/webhooks', label: 'Webhooks', permission: 'integrations.manage', icon: 'webhook' }],
  blueprints: [webhooksBlueprint],
  adminScreens: [
    { path: 'webhooks', label: 'Webhooks', group: 'Интеграции', element: createElement(CrudListPage, { resource: 'webhooks' }) },
    { path: 'webhooks/:id', label: 'Редактирование webhook', group: 'Интеграции', element: createElement(CrudEditPage, { resource: 'webhooks' }) },
  ],
})
