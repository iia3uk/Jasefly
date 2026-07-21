import { createElement } from 'react'
import { registerModule } from '@/core/moduleRegistry'
import { CrudListPage, BlogEditPage } from '@/admin/pages/AdminPages'

registerModule({
  name: 'blog',
  label: 'Блог',
  adminNav: [{ group: 'Блог', path: '/admin/blog', label: 'Блог', icon: 'file-text' }],
  adminScreens: [
    { path: 'blog', label: 'Блог', group: 'Контент', element: createElement(CrudListPage, { resource: 'blog' }) },
    { path: 'blog/:id', label: 'Редактирование поста', group: 'Контент', element: createElement(BlogEditPage) },
  ],
})

export type { BlogPost } from '@/types'
