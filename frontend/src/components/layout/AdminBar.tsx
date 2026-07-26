import { Link, useLocation, useNavigate } from 'react-router-dom'
import { ExternalLink, LayoutTemplate, LogOut, Pencil, Plus, Settings } from 'lucide-react'
import { useEffect } from 'react'
import { useAuth } from '@/context/AuthContext'
import { useSiteContext } from '@/context/SiteContext'
import { useCrud, usePage, usePluginEnabled } from '@/hooks/useApi'
import { emptyLayout } from '@/builder/types'
import { adminUrl, getAdminBase } from '@/admin/adminBasePath'
import type { Page } from '@/types'

const RESERVED = new Set([
  '',
  'about',
  'projects',
  'services',
  'blog',
  'contact',
  'privacy',
  'admin',
  'api',
])

/**
 * WordPress-style top admin bar on the public site when logged in.
 * Primary CTA jumps straight into the page builder for the current URL.
 */
export function AdminBar() {
  const { token, userName, logout } = useAuth()
  const { site } = useSiteContext()
  const location = useLocation()
  const nav = useNavigate()
  const { save } = useCrud('pages')

  const path = location.pathname.replace(/\/$/, '') || '/'
  const firstSeg = path === '/' ? '' : path.split('/').filter(Boolean)[0] ?? ''
  const adminBase = getAdminBase()
  const reserved = new Set([...RESERVED, adminBase])
  const isCmsSlug = Boolean(firstSeg) && !reserved.has(firstSeg) && !path.startsWith('/projects/') && !path.startsWith('/blog/')
  const cmsSlug = isCmsSlug ? firstSeg : ''
  const { data: cmsPage } = usePage(cmsSlug)
  const projectsOn = usePluginEnabled('projects')
  const blogOn = usePluginEnabled('blog')
  const portfolioOn = usePluginEnabled('portfolio')
  const servicesOn = usePluginEnabled('services') || portfolioOn

  useEffect(() => {
    if (!token) {
      document.documentElement.style.removeProperty('--admin-bar-h')
      return
    }
    document.documentElement.style.setProperty('--admin-bar-h', '36px')
    return () => {
      document.documentElement.style.removeProperty('--admin-bar-h')
    }
  }, [token])

  if (!token) return null

  const homeId = site?.home_page?.id
  let editHref: string | null = null
  let editLabel = 'Редактировать'

  if (path === '/') {
    if (homeId != null) {
      editHref = adminUrl(`/pages/${homeId}/builder`)
      editLabel = 'Редактировать в билдере'
    } else {
      editHref = adminUrl('/pages')
      editLabel = 'Открыть страницы'
    }
  } else if (isCmsSlug && cmsPage?.id != null) {
    editHref = adminUrl(`/pages/${cmsPage.id}/builder`)
    editLabel = 'Редактировать в билдере'
  } else if (path.startsWith('/projects') && projectsOn) {
    editHref = adminUrl('/projects')
    editLabel = 'Проекты в админке'
  } else if (path.startsWith('/blog') && blogOn) {
    editHref = adminUrl('/blog')
    editLabel = 'Блог в админке'
  } else if (path === '/contact') {
    editHref = adminUrl('/contact-info')
    editLabel = 'Контакты'
  } else if (path === '/about' && portfolioOn) {
    editHref = adminUrl('/profile')
    editLabel = 'Профиль'
  } else if (path === '/services' && servicesOn) {
    editHref = adminUrl('/services')
    editLabel = 'Услуги'
  } else {
    editHref = adminUrl('/pages')
    editLabel = 'Страницы'
  }

  const createPage = async () => {
    try {
      const created = await save.mutateAsync({
        data: {
          title: 'Новая страница',
          slug: `page-${Date.now()}`,
          status: 'draft',
          layout: emptyLayout(),
          is_home: 0,
        },
      })
      const id = (created as Page)?.id
      if (id != null) nav(adminUrl(`/pages/${id}/builder`))
      else nav(adminUrl('/pages'))
    } catch (e) {
      window.alert(e instanceof Error ? e.message : 'Не удалось создать')
    }
  }

  const maintenanceOn = Boolean(site?.site_settings?.maintenance_mode)

  return (
    <div
      className="fixed inset-x-0 top-0 z-[100] flex h-9 items-center gap-1 border-b border-black/40 bg-[#1d2327] px-2 text-[13px] text-[#f0f0f1] shadow-md sm:gap-2 sm:px-3"
      role="navigation"
      aria-label="Панель администратора"
    >
      <Link
        to={adminUrl()}
        className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded px-2 font-medium hover:bg-white/10"
      >
        <Settings size={14} />
        <span className="hidden sm:inline">Админка</span>
      </Link>

      {maintenanceOn && (
        <Link
          to={adminUrl('/site-settings')}
          className="inline-flex h-7 max-w-[40vw] items-center truncate rounded bg-amber-500/90 px-2 text-[12px] font-medium text-black hover:bg-amber-400 sm:max-w-none"
          title="Режим техработ включён — гости видят заглушку"
        >
          Техработы
        </Link>
      )}

      <span className="hidden h-4 w-px bg-white/15 sm:block" />

      {editHref && (
        <Link
          to={editHref}
          className="inline-flex h-7 items-center gap-1.5 rounded bg-[#2271b1] px-2.5 font-medium text-white hover:bg-[#135e96]"
        >
          <LayoutTemplate size={14} />
          <span className="max-w-[42vw] truncate sm:max-w-none">{editLabel}</span>
        </Link>
      )}

      <Link
        to={adminUrl('/pages')}
        className="inline-flex h-7 items-center gap-1.5 rounded px-2 hover:bg-white/10"
        title="Все страницы"
      >
        <Pencil size={13} />
        <span className="hidden md:inline">Страницы</span>
      </Link>

      <button
        type="button"
        className="inline-flex h-7 items-center gap-1 rounded px-2 hover:bg-white/10 disabled:opacity-50"
        title="Создать страницу и открыть билдер"
        disabled={save.isPending}
        onClick={() => void createPage()}
      >
        <Plus size={14} />
        <span className="hidden lg:inline">Новая</span>
      </button>

      <div className="ml-auto flex items-center gap-1 sm:gap-2">
        <a
          href={path}
          target="_blank"
          rel="noreferrer"
          className="inline-flex h-7 items-center gap-1 rounded px-2 text-[#c3c4c7] hover:bg-white/10 hover:text-white"
          title="Открыть в новой вкладке"
        >
          <ExternalLink size={13} />
        </a>
        <span className="hidden max-w-[8rem] truncate text-[#c3c4c7] sm:inline">{userName || 'Admin'}</span>
        <button
          type="button"
          className="inline-flex h-7 items-center gap-1 rounded px-2 text-[#c3c4c7] hover:bg-white/10 hover:text-white"
          onClick={() => logout()}
          title="Выйти"
        >
          <LogOut size={13} />
          <span className="hidden sm:inline">Выйти</span>
        </button>
      </div>
    </div>
  )
}
