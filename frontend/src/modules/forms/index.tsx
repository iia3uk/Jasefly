import { createElement } from 'react'
import { registerModule } from '@/core/moduleRegistry'
import { FormsAdminPage } from '@/admin/pages/FormsAdminPage'
import { FormSubmissionsPage } from '@/admin/pages/FormSubmissionsPage'

registerModule({
  name: 'forms',
  label: 'Формы',
  adminNav: [
    {
      group: 'Контент',
      path: '/admin/forms',
      label: 'Формы',
      permission: 'forms.view',
      icon: 'form-input',
    },
    {
      group: 'Контент',
      path: '/admin/form-submissions',
      label: 'Заявки форм',
      permission: 'forms.submissions.view',
      icon: 'clipboard-list',
    },
  ],
  adminScreens: [
    { path: 'forms', label: 'Формы', group: 'Контент', element: createElement(FormsAdminPage) },
    { path: 'form-submissions', label: 'Заявки форм', group: 'Контент', element: createElement(FormSubmissionsPage) },
  ],
})
