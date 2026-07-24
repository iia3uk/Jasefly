import { createElement } from 'react'
import { registerModule } from '@/core/moduleRegistry'
import { LabListPage } from './admin/LabListPage'
import { LabEditPage } from './admin/LabEditPage'
import { LabPreviewPage } from './admin/LabPreviewPage'

registerModule({
  name: 'lab',
  label: 'Jasefly Lab',
  adminNav: [
    {
      group: 'Разработка',
      path: '/admin/lab',
      label: 'Jasefly Lab',
      permission: 'lab.view',
      icon: 'sparkles',
    },
  ],
  adminScreens: [
    { path: 'lab', label: 'Jasefly Lab', group: 'Разработка', element: createElement(LabListPage) },
    { path: 'lab/new', label: 'Новый эксперимент', group: 'Разработка', element: createElement(LabEditPage) },
    { path: 'lab/:id/preview', label: 'Lab Preview', group: 'Разработка', element: createElement(LabPreviewPage) },
    { path: 'lab/:id', label: 'Редактирование эксперимента', group: 'Разработка', element: createElement(LabEditPage) },
  ],
})
