import { createElement } from 'react'
import { registerModule } from '@/core/moduleRegistry'
import { CommentsAdminPage } from './CommentsAdminPage'

registerModule({
  name:'comments',
  label:'Комментарии',
  adminNav:[{group:'Коммуникации',path:'/admin/comments',label:'Модерация',permission:'comments.view',icon:'message-square'}],
  adminScreens:[{path:'comments',label:'Модерация',group:'Коммуникации',element:createElement(CommentsAdminPage)}],
})
