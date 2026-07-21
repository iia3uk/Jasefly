import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { adminUrl } from '@/admin/adminBasePath'
import { t } from '@/admin/i18n'
import { GlassPanel } from '@/components/ui'

/** Gate an admin screen by permission slug. */
export function RequirePermission({
  permission,
  children,
}: {
  permission: string
  children: ReactNode
}) {
  const { can } = useAuth()
  if (can(permission)) return <>{children}</>
  return (
    <GlassPanel className="mx-auto mt-10 max-w-lg p-8 text-center">
      <h1 className="font-heading text-xl text-white">{t.insufficientPermissions}</h1>
      <p className="mt-2 text-sm text-zinc-400">
        {t.insufficientPermissionsHint(permission)}
      </p>
      <Link to={adminUrl()} className="mt-6 inline-block text-sm text-zinc-300 underline hover:text-white">
        {t.backToDashboard}
      </Link>
    </GlassPanel>
  )
}
