import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { PreferCmsLayout } from '@/builder/public/CmsPages'
import { Container } from '@/components/ui'
import { SeoHead, ThemeApplier } from '@/components/layout/SiteLayout'
import { SiteTemplateInjector } from '@/components/layout/SiteTemplateInjector'
import { useAuth, STAFF_ROLES } from '@/context/AuthContext'
import { useSiteContext } from '@/context/SiteContext'
import { adminUrl } from '@/admin/adminBasePath'

function ClassicMaintenanceFallback() {
  const { site } = useSiteContext()
  const ss = site?.site_settings
  const title = (ss?.maintenance_title || 'Ведутся технические работы').trim()
  const message = (ss?.maintenance_message
    || 'Сайт временно недоступен. Загляните позже — мы скоро вернёмся.').trim()

  return (
    <div className="flex min-h-[100dvh] items-center justify-center px-4 py-16">
      <Container className="max-w-lg text-center">
        <p className="text-sm font-medium tracking-[0.08em] text-[var(--accent)] uppercase">
          Технические работы
        </p>
        <h1 className="mt-4 font-heading text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">
          {title}
        </h1>
        <p className="mt-4 text-base leading-7 text-[var(--muted)] whitespace-pre-line">{message}</p>
        <Link
          to={adminUrl('/login')}
          className="button button-ghost mt-10 inline-flex w-full sm:w-auto"
        >
          Вход для администратора
        </Link>
      </Container>
    </div>
  )
}

/** Экран техработ для гостей (и member). Staff при allow_staff видит сайт. */
export function MaintenanceScreen() {
  return (
    <div className="min-h-[100dvh] bg-[var(--background)] text-[var(--text)]">
      <ThemeApplier />
      <SiteTemplateInjector />
      <SeoHead title="Технические работы" path="/maintenance" noIndex />
      <PreferCmsLayout
        slug="maintenance"
        seoPath="/maintenance"
        fallback={<ClassicMaintenanceFallback />}
      />
    </div>
  )
}

/**
 * Если включён maintenance_mode — гости видят шаблон техработ.
 * Авторизованный staff (admin/editor/super_admin) проходит на сайт.
 */
export function MaintenanceGate({ children }: { children: ReactNode }) {
  const { site, loading } = useSiteContext()
  const { token, role } = useAuth()
  const ss = site?.site_settings
  const on = Boolean(ss?.maintenance_mode)
  const allowStaff = ss?.maintenance_allow_staff === undefined || ss?.maintenance_allow_staff === null
    ? true
    : Boolean(ss.maintenance_allow_staff)

  if (loading) return <>{children}</>
  if (!on) return <>{children}</>

  const isStaff = Boolean(token && role && STAFF_ROLES.has(role))
  if (allowStaff && isStaff) return <>{children}</>

  return <MaintenanceScreen />
}
