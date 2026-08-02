import { createElement } from 'react'
import { registerModule } from '@/core/moduleRegistry'
import { CrudListPage } from '@/admin/pages/AdminPages'
import { BlogEditPage } from '@/modules/blog/admin/BlogEditPage'

registerModule({
  name: 'blog',
  label: 'Блог',
  adminNav: [{ group: 'Блог', path: '/admin/blog', label: 'Блог', icon: 'newspaper' }],
  adminScreens: [
    { path: 'blog', label: 'Блог', group: 'Контент', element: createElement(CrudListPage, { resource: 'blog' }) },
    { path: 'blog/:id', label: 'Редактирование поста', group: 'Контент', element: createElement(BlogEditPage) },
  ],
})

export { BlogEditPage } from '@/modules/blog/admin/BlogEditPage'
export type { BlogPost } from '@/types'
