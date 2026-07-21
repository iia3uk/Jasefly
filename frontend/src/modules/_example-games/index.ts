/**
 * Example future module — Games / marketplace / courses.
 * Copy this folder, register routes in AppRouter, and ship migrations.
 */
import { registerModule } from '@/core/moduleRegistry'

registerModule({
  name: 'games',
  label: 'Games',
  enabled: false,
  adminNav: [{ group: 'Content', path: '/admin/games', label: 'Games' }],
})
