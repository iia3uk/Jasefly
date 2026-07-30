import { Link } from 'react-router-dom'
import { useDashboard } from '@/hooks/useApi'
import { t } from '@/admin/i18n'
import { adminUrl } from '@/admin/adminBasePath'
import { AdminPageHero } from '@/admin/components/AdminPageHero'
import { DashboardShell } from '@/admin/dashboard/DashboardShell'

export function DashboardPage() {
  const { data } = useDashboard()

  return (
    <>
      <AdminPageHero
        title={t.dashboard}
        hint={t.dashboardHint}
        eyebrow="Обзор"
        accent="teal"
        actions={
          (data?.unread_messages ?? 0) > 0 ? (
            <Link
              to={adminUrl('/messages')}
              className="inline-flex items-center gap-2 rounded-full border border-amber-400/35 bg-amber-500/10 px-3.5 py-1.5 text-sm font-medium text-amber-100 transition hover:border-amber-300/50 hover:bg-amber-500/15"
            >
              <span className="size-1.5 rounded-full bg-amber-300" aria-hidden />
              {t.unreadMessages}: {data?.unread_messages}
            </Link>
          ) : undefined
        }
      />

      <DashboardShell />
    </>
  )
}
