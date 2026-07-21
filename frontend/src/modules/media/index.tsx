import { createElement } from 'react'
import { registerModule } from '@/core/moduleRegistry'
import { MediaLibraryPage } from '@/admin/pages/UtilityPages'

registerModule({
  name: 'media',
  label: 'Медиа',
  adminNav: [{ group: 'Медиа', path: '/admin/media', label: 'Медиатека', permission: 'media.manage', icon: 'image' }],
  adminScreens: [
    { path: 'media', label: 'Медиатека', group: 'Медиа', element: createElement(MediaLibraryPage) },
  ],
})
