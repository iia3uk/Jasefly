import { createElement } from 'react'
import { registerModule } from '@/core/moduleRegistry'
import { CrudListPage, CrudEditPage } from '@/admin/pages/AdminPages'
import type { Blueprint } from '@/core/pluginTypes'

const col = (
  label: string,
  widget: string,
  opts: Partial<Blueprint['columns'][string]> = {},
): Blueprint['columns'][string] => ({
  type: (opts.type as Blueprint['columns'][string]['type']) || 'string',
  widget: widget as Blueprint['columns'][string]['widget'],
  label,
  required: opts.required ?? false,
  default: opts.default ?? null,
  nullable: opts.nullable ?? true,
  index: false,
  permission: null,
  visible: true,
  options: opts.options ?? null,
  min: null,
  max: null,
  pattern: null,
  help: opts.help ?? null,
})

const servicesBlueprint: Blueprint = {
  key: 'services',
  table: 'services',
  label: 'Услуги',
  singleton: false,
  soft_delete: true,
  slug: true,
  seo: false,
  group: 'Контент',
  orderable: true,
  icon: 'settings',
  columns: {
    title: col('Название', 'text', { required: true }),
    short_description: col('Краткое описание', 'textarea', { type: 'text' }),
    description: col('Описание', 'richtext', { type: 'longtext' }),
    icon: col('Иконка', 'text'),
    price_label: col('Цена (подпись)', 'text', { help: 'Текст для витрины, напр. «от 10 000 ₽»' }),
    price: col('Цена оплаты', 'number', { type: 'decimal', help: 'Числовая цена для эквайринга' }),
    currency: col('Валюта', 'text', { default: 'RUB' }),
    is_purchasable: col('Можно купить', 'toggle', { type: 'bool', default: false }),
    offer_text: col('Условия (кратко)', 'textarea', { type: 'text' }),
    duration_label: col('Срок / формат', 'text'),
    features: col('Возможности', 'json', { type: 'json' }),
    sort_order: col('Порядок', 'number', { type: 'int', default: 0 }),
    is_visible: col('Видим', 'toggle', { type: 'bool', default: true }),
  },
  indexes: [],
  permissions: ['content.view', 'content.edit', 'content.delete'],
}

registerModule({
  name: 'services',
  label: 'Услуги',
  adminNav: [{ group: 'Услуги', path: '/admin/services', label: 'Услуги', icon: 'settings' }],
  blueprints: [servicesBlueprint],
  adminScreens: [
    { path: 'services', label: 'Услуги', group: 'Контент', element: createElement(CrudListPage, { resource: 'services' }) },
    { path: 'services/:id', label: 'Редактирование услуги', group: 'Контент', element: createElement(CrudEditPage, { resource: 'services' }) },
  ],
})
