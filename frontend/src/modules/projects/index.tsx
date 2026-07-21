import { createElement } from 'react'
import { registerModule } from '@/core/moduleRegistry'
import { CrudListPage, ProjectEditPage } from '@/admin/pages/AdminPages'
import type { Blueprint } from '@/core/pluginTypes'

const projectsBlueprint: Blueprint = {
  key: 'projects',
  table: 'projects',
  label: 'Проекты',
  singleton: false,
  soft_delete: true,
  slug: true,
  seo: true,
  group: 'Контент',
  orderable: true,
  icon: 'folder',
  columns: {
    title: { type: 'string', widget: 'text', label: 'Название', required: true, default: null, nullable: true, index: false, permission: null, visible: true, options: null, min: null, max: null, pattern: null, help: null },
    short_description: { type: 'text', widget: 'textarea', label: 'Краткое описание', required: false, default: null, nullable: true, index: false, permission: null, visible: true, options: null, min: null, max: null, pattern: null, help: null },
    description: { type: 'longtext', widget: 'richtext', label: 'Описание', required: false, default: null, nullable: true, index: false, permission: null, visible: true, options: null, min: null, max: null, pattern: null, help: null },
    content: { type: 'longtext', widget: 'richtext', label: 'Контент', required: false, default: null, nullable: true, index: false, permission: null, visible: true, options: null, min: null, max: null, pattern: null, help: null },
    status: { type: 'string', widget: 'select', label: 'Статус', required: false, default: 'draft', nullable: true, index: false, permission: null, visible: true, options: [{ value: 'draft', label: 'Черновик' }, { value: 'published', label: 'Опубликован' }, { value: 'archived', label: 'В архиве' }], min: null, max: null, pattern: null, help: null },
    is_featured: { type: 'bool', widget: 'toggle', label: 'Избранный', required: false, default: false, nullable: true, index: false, permission: null, visible: true, options: null, min: null, max: null, pattern: null, help: null },
    sort_order: { type: 'int', widget: 'number', label: 'Порядок', required: false, default: 0, nullable: true, index: false, permission: null, visible: true, options: null, min: null, max: null, pattern: null, help: null },
    role: { type: 'string', widget: 'text', label: 'Роль', required: false, default: null, nullable: true, index: false, permission: null, visible: true, options: null, min: null, max: null, pattern: null, help: null },
    github_url: { type: 'string', widget: 'url', label: 'GitHub URL', required: false, default: null, nullable: true, index: false, permission: null, visible: true, options: null, min: null, max: null, pattern: null, help: null },
    website_url: { type: 'string', widget: 'url', label: 'Сайт', required: false, default: null, nullable: true, index: false, permission: null, visible: true, options: null, min: null, max: null, pattern: null, help: null },
    video_url: { type: 'string', widget: 'url', label: 'Видео', required: false, default: null, nullable: true, index: false, permission: null, visible: true, options: null, min: null, max: null, pattern: null, help: null },
  },
  indexes: [],
  permissions: ['content.view', 'content.edit', 'content.delete'],
}

registerModule({
  name: 'projects',
  label: 'Проекты',
  adminNav: [{ group: 'Проекты', path: '/admin/projects', label: 'Проекты', icon: 'folder' }],
  blueprints: [projectsBlueprint],
  adminScreens: [
    { path: 'projects', label: 'Проекты', group: 'Контент', element: createElement(CrudListPage, { resource: 'projects' }) },
    { path: 'projects/:id', label: 'Редактирование проекта', group: 'Контент', element: createElement(ProjectEditPage) },
  ],
})

export * from './types'
