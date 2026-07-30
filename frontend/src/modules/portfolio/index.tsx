import { createElement } from 'react'
import { registerModule } from '@/core/moduleRegistry'
import { CrudListPage, CrudEditPage, ProfilePage } from '@/admin/pages/AdminPages'
import type { Blueprint } from '@/core/pluginTypes'

const testimonialsBlueprint: Blueprint = {
  key: 'testimonials',
  table: 'testimonials',
  label: 'Отзывы',
  singleton: false,
  soft_delete: true,
  slug: false,
  seo: false,
  group: 'Контент',
  orderable: true,
  icon: 'message-square',
  columns: {
    author_name: { type: 'string', widget: 'text', label: 'Имя автора', required: true, default: null, nullable: true, index: false, permission: null, visible: true, options: null, min: null, max: null, pattern: null, help: null },
    author_role: { type: 'string', widget: 'text', label: 'Роль автора', required: false, default: null, nullable: true, index: false, permission: null, visible: true, options: null, min: null, max: null, pattern: null, help: null },
    author_company: { type: 'string', widget: 'text', label: 'Компания', required: false, default: null, nullable: true, index: false, permission: null, visible: true, options: null, min: null, max: null, pattern: null, help: null },
    content: { type: 'text', widget: 'textarea', label: 'Содержание', required: true, default: null, nullable: true, index: false, permission: null, visible: true, options: null, min: null, max: null, pattern: null, help: null },
    rating: { type: 'int', widget: 'number', label: 'Оценка', required: false, default: null, nullable: true, index: false, permission: null, visible: true, options: null, min: 1, max: 5, pattern: null, help: null },
    sort_order: { type: 'int', widget: 'number', label: 'Порядок', required: false, default: 0, nullable: true, index: false, permission: null, visible: true, options: null, min: null, max: null, pattern: null, help: null },
    is_visible: { type: 'bool', widget: 'toggle', label: 'Видим', required: false, default: true, nullable: true, index: false, permission: null, visible: true, options: null, min: null, max: null, pattern: null, help: null },
  },
  indexes: [],
  permissions: ['content.view', 'content.edit', 'content.delete'],
}

// Portfolio plugin manifest — registers portfolio-specific content items.
// Projects / blog / services have their own manifests but are also portfolio
// features; they remain separate for now and are consolidated in the
// PortfolioPlugin extraction phase.
registerModule({
  name: 'portfolio',
  label: 'Портфолио',
  adminNav: [
    { group: 'Портфолио', path: '/admin/profile', label: 'Портфолио', icon: 'users' },
  ],
  blueprints: [testimonialsBlueprint],
  adminScreens: [
    { path: 'profile', label: 'Профиль', group: 'Контент', element: createElement(ProfilePage) },
    { path: 'statistics', label: 'Статистика', group: 'Контент', element: createElement(CrudListPage, { resource: 'statistics' }) },
    { path: 'statistics/:id', label: 'Редактирование', group: 'Контент', element: createElement(CrudEditPage, { resource: 'statistics' }) },
    { path: 'experience', label: 'Опыт', group: 'Контент', element: createElement(CrudListPage, { resource: 'experience' }) },
    { path: 'experience/:id', label: 'Редактирование', group: 'Контент', element: createElement(CrudEditPage, { resource: 'experience' }) },
    { path: 'education', label: 'Образование', group: 'Контент', element: createElement(CrudListPage, { resource: 'education' }) },
    { path: 'education/:id', label: 'Редактирование', group: 'Контент', element: createElement(CrudEditPage, { resource: 'education' }) },
    { path: 'skills', label: 'Навыки', group: 'Контент', element: createElement(CrudListPage, { resource: 'skills' }) },
    { path: 'skills/:id', label: 'Редактирование', group: 'Контент', element: createElement(CrudEditPage, { resource: 'skills' }) },
    { path: 'skill-categories', label: 'Категории навыков', group: 'Контент', element: createElement(CrudListPage, { resource: 'skill-categories' }) },
    { path: 'skill-categories/:id', label: 'Редактирование', group: 'Контент', element: createElement(CrudEditPage, { resource: 'skill-categories' }) },
    { path: 'testimonials', label: 'Отзывы', group: 'Контент', element: createElement(CrudListPage, { resource: 'testimonials' }) },
    { path: 'testimonials/:id', label: 'Редактирование', group: 'Контент', element: createElement(CrudEditPage, { resource: 'testimonials' }) },
  ],
})
