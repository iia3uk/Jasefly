import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  FileText, FolderKanban, Image, LayoutDashboard, LogOut, Settings, Users, BriefcaseBusiness,
  GraduationCap, Wrench, MessageSquare, MessageCircle, HelpCircle, PanelTop, Mail, Palette, Database, KeyRound, Globe,
  Menu, Trash2, Activity, HeartPulse, X, Layers, ExternalLink, PanelLeftClose, PanelLeft, Pin, PinOff, Keyboard,
  LayoutTemplate, Webhook, ShoppingCart, CreditCard, Shield, RefreshCw, Bell, Workflow, Send, ChevronDown,
  type LucideIcon,
} from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { Button, Container } from '@/components/ui'
import { PreferCmsLayout } from '@/builder/public/CmsPages'
import { ThemeApplier } from '@/components/layout/SiteLayout'
import { SiteTemplateInjector } from '@/components/layout/SiteTemplateInjector'
import { BrandLogo } from '@/components/BrandLogo'
import { GlobalSearch } from '@/admin/components/GlobalSearch'
import { ShortcutsHelp } from '@/admin/components/ShortcutsHelp'
import { MigrationBanner } from '@/admin/components/MigrationBanner'
import { t, useAdminLocale, resourceTitle, translateNavGroup } from '@/admin/i18n'
import { AdminLocaleSwitcher } from '@/admin/components/AdminLocaleSwitcher'
import { readPinnedNav, readSidebarCollapsed, writePinnedNav, writeSidebarCollapsed } from '@/admin/lib/prefs'
import { getAdminNavGrouped, setPluginStates, subscribePluginState, type PluginState } from '@/core/moduleRegistry'
import {
  findHubByNavPath,
  findHubByPath,
  isHubNavActive,
  resolveHubPin,
  visibleHubTabs,
  type AdminHub,
} from '@/admin/adminHubs'
import { AdminHubTabs } from '@/admin/components/AdminHubTabs'
import { adminUrl, getAdminBase, isAdminPathname, toCanonicalAdminPath } from '@/admin/adminBasePath'
import { api, endpoints } from '@/lib/api'
import { usePluginEnabled } from '@/hooks/useApi'
import { NotificationsBell } from '@/modules/notifications/NotificationsBell'

// Icon registry — maps manifest icon keys to lucide components.
// Plugins reference icons by string key so manifests stay serializable.
const iconRegistry: Record<string, LucideIcon> = {
  users: Users,
  globe: Globe,
  'layout-dashboard': LayoutDashboard,
  briefcase: BriefcaseBusiness,
  graduation: GraduationCap,
  wrench: Wrench,
  layers: Layers,
  folder: FolderKanban,
  'file-text': FileText,
  settings: Settings,
  'message-square': MessageSquare,
  'message-circle': MessageCircle,
  'help-circle': HelpCircle,
  trash: Trash2,
  'panel-top': PanelTop,
  'layout-template': LayoutTemplate,
  menu: Menu,
  mail: Mail,
  image: Image,
  activity: Activity,
  heart: HeartPulse,
  palette: Palette,
  database: Database,
  key: KeyRound,
  webhook: Webhook,
  'shopping-cart': ShoppingCart,
  'credit-card': CreditCard,
  shield: Shield,
  'refresh-cw': RefreshCw,
  bell: Bell,
  workflow: Workflow,
  send: Send,
}

// Fallback icon map for legacy hardcoded paths (kept until all routes
// are migrated to manifests; resolved by path when no icon key is provided).
const legacyPathIcons: Record<string, LucideIcon> = {
  '/admin/profile': Users,
  '/admin/social-links': Globe,
  '/admin/statistics': LayoutDashboard,
  '/admin/experience': BriefcaseBusiness,
  '/admin/education': GraduationCap,
  '/admin/skills': Wrench,
  '/admin/skill-categories': Layers,
  '/admin/projects': FolderKanban,
  '/admin/blog': FileText,
  '/admin/services': Settings,
  '/admin/testimonials': MessageSquare,
  '/admin/trash': Trash2,
  '/admin/hero': PanelTop,
  '/admin/pages': LayoutTemplate,
  '/admin/homepage': Globe,
  '/admin/navigation': Menu,
  '/admin/footer': PanelTop,
  '/admin/contact-info': Mail,
  '/admin/messages': MessageSquare,
  '/admin/media': Image,
  '/admin/activity': Activity,
  '/admin/system': HeartPulse,
  '/admin/seo': Globe,
  '/admin/redirects': Globe,
  '/admin/site-settings': Settings,
  '/admin/theme': Palette,
  '/admin/email': Mail,
  '/admin/backup': Database,
  '/admin/updates': RefreshCw,
  '/admin/password': KeyRound,
}

function resolveIcon(path: string, iconKey?: string): LucideIcon {
  if (iconKey && iconRegistry[iconKey]) return iconRegistry[iconKey]
  const canon = toCanonicalAdminPath(path)
  return legacyPathIcons[canon] ?? legacyPathIcons[path] ?? FileText
}

function isTypingTarget(el: EventTarget | null) {
  if (!(el instanceof HTMLElement)) return false
  const tag = el.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable
}

function AdminNav({
  onNavigate,
  collapsed,
  pinned,
  onTogglePin,
}: {
  onNavigate?: () => void
  collapsed?: boolean
  pinned: string[]
  onTogglePin: (path: string) => void
}) {
  const { logout, userName, role, can } = useAuth()
  const { locale } = useAdminLocale()
  const location = useLocation()
  const pinSet = useMemo(() => new Set(pinned), [pinned])
  const productsOn = usePluginEnabled('products')
  const paymentsOn = usePluginEnabled('payments')
  const ordersOn = usePluginEnabled('orders')
  const pluginFlags = useMemo(
    () => ({ products: productsOn, payments: paymentsOn, orders: ordersOn }),
    [productsOn, paymentsOn, ordersOn],
  )
  /** Manual expand/collapse for hubs that are not the active route. */
  const [hubOpenManual, setHubOpenManual] = useState<Record<string, boolean>>({})

  // Re-read nav whenever a plugin is toggled (registry is a module-level Set;
  // without a subscription the sidebar would stay frozen after first paint).
  const [navTick, setNavTick] = useState(0)
  useEffect(() => subscribePluginState(() => setNavTick((n) => n + 1)), [])

  // Sidebar groups are generated from the module registry (plugin manifests).
  // Order is preserved by insertion order of manifests + adminNav arrays.
  // locale in deps forces re-render when RU/EN switches (t proxy alone is not reactive).
  const groupedNav = useMemo(() => {
    void locale
    const raw = getAdminNavGrouped()
    const filtered: typeof raw = {}
    for (const [group, items] of Object.entries(raw)) {
      const visible = (items ?? []).filter((it) => !it.permission || can(it.permission))
      if (visible.length) filtered[group] = visible
    }
    return filtered
  }, [navTick, can, locale])

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `mb-1 flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition ${
      collapsed ? 'justify-center px-2' : ''
    } ${isActive ? 'bg-white/10 text-white' : 'text-zinc-400 hover:bg-white/5 hover:text-white'}`

  const resolveDisplayLabel = (to: string, label: string) => {
    const hub = findHubByNavPath(to)
    if (hub) return hub.navLabel
    const canon = toCanonicalAdminPath(to)
    const seg = canon.replace(/^\/admin\/?/, '').split('/')[0] || ''
    const translated = seg ? resourceTitle(seg) : label
    return translated !== seg.replace(/-/g, ' ') ? translated : label
  }

  const renderLink = (to: string, label: string, iconKey?: string, showPin?: boolean, pinPath?: string) => {
    const href = adminUrl(to)
    const Icon = resolveIcon(to, iconKey)
    const pinKey = pinPath ?? to
    const isPinned = pinSet.has(toCanonicalAdminPath(pinKey)) || pinSet.has(pinKey)
    const displayLabel = resolveDisplayLabel(to, label)
    return (
      <div key={pinKey} className={`group relative mb-1 flex items-center ${collapsed ? '' : 'gap-0.5'}`}>
        <NavLink
          to={href}
          onClick={onNavigate}
          title={collapsed ? displayLabel : undefined}
          className={({ isActive }) =>
            linkClass({ isActive: isActive || isHubNavActive(to, location.pathname) })
          }
          end={toCanonicalAdminPath(to) === '/admin' || href === `/${getAdminBase()}`}
        >
          <Icon size={16} className="shrink-0" />
          {!collapsed && <span className="min-w-0 truncate">{displayLabel}</span>}
        </NavLink>
        {!collapsed && showPin && (
          <button
            type="button"
            title={isPinned ? t.unpinSection : t.pinSection}
            aria-label={isPinned ? t.unpinSection : t.pinSection}
            className="invisible inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-zinc-600 opacity-0 transition group-hover:visible group-hover:opacity-100 hover:bg-white/5 hover:text-zinc-300"
            onClick={(e) => {
              e.preventDefault()
              onTogglePin(toCanonicalAdminPath(pinKey))
            }}
          >
            {isPinned ? <PinOff size={14} /> : <Pin size={14} />}
          </button>
        )}
      </div>
    )
  }

  const renderHubNav = (hub: AdminHub, iconKey?: string, showPin?: boolean) => {
    const tabs = visibleHubTabs(hub, pluginFlags)
    if (tabs.length < 2) {
      return renderLink(hub.navPath, hub.navLabel, iconKey ?? hub.icon, showPin)
    }

    const hubActive = isHubNavActive(hub.navPath, location.pathname)
    const open = collapsed ? false : (hubOpenManual[hub.id] ?? hubActive)
    const Icon = resolveIcon(hub.navPath, iconKey ?? hub.icon)
    const pinKey = hub.navPath
    const isPinned = pinSet.has(toCanonicalAdminPath(pinKey)) || pinSet.has(pinKey)
    const href = adminUrl(hub.navPath)

    return (
      <div key={hub.id} className="mb-1">
        <div className={`group relative flex items-center ${collapsed ? '' : 'gap-0.5'}`}>
          <NavLink
            to={href}
            onClick={() => {
              if (!open) {
                setHubOpenManual((prev) => ({ ...prev, [hub.id]: true }))
              }
              onNavigate?.()
            }}
            title={collapsed ? hub.navLabel : undefined}
            className={({ isActive }) =>
              `${linkClass({ isActive: isActive || hubActive })} ${collapsed ? '' : 'min-w-0 flex-1'}`
            }
            end={false}
          >
            <Icon size={16} className="shrink-0" />
            {!collapsed && <span className="min-w-0 truncate">{hub.navLabel}</span>}
          </NavLink>
          {!collapsed && (
            <button
              type="button"
              title={open ? 'Свернуть раздел' : 'Показать разделы'}
              aria-label={open ? 'Свернуть раздел' : 'Показать разделы'}
              aria-expanded={open}
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-zinc-500 hover:bg-white/5 hover:text-zinc-300"
              onClick={(e) => {
                e.preventDefault()
                setHubOpenManual((prev) => ({
                  ...prev,
                  [hub.id]: !(prev[hub.id] ?? hubActive),
                }))
              }}
            >
              <ChevronDown
                size={14}
                className={`transition ${open ? 'rotate-0' : '-rotate-90'}`}
              />
            </button>
          )}
          {!collapsed && showPin && (
            <button
              type="button"
              title={isPinned ? t.unpinSection : t.pinSection}
              aria-label={isPinned ? t.unpinSection : t.pinSection}
              className="invisible inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-zinc-600 opacity-0 transition group-hover:visible group-hover:opacity-100 hover:bg-white/5 hover:text-zinc-300"
              onClick={(e) => {
                e.preventDefault()
                onTogglePin(toCanonicalAdminPath(pinKey))
              }}
            >
              {isPinned ? <PinOff size={14} /> : <Pin size={14} />}
            </button>
          )}
        </div>
        {open && (
          <div className="ml-3 space-y-0.5 border-l border-white/10 pl-2">
            {tabs.map((tab) => {
              const tabHref = adminUrl(tab.path)
              const tabCanon = toCanonicalAdminPath(location.pathname)
              const tabActive =
                tabCanon === tab.path || tabCanon.startsWith(`${tab.path}/`)
              return (
                <NavLink
                  key={tab.path}
                  to={tabHref}
                  onClick={onNavigate}
                  className={`mb-0.5 block rounded-lg px-3 py-1.5 text-[13px] transition ${
                    tabActive
                      ? 'bg-white/10 text-white'
                      : 'text-zinc-500 hover:bg-white/5 hover:text-zinc-300'
                  }`}
                >
                  {tab.label}
                </NavLink>
              )
            })}
          </div>
        )}
      </div>
    )
  }

  const renderNavItem = (to: string, label: string, iconKey?: string, showPin?: boolean, pinPath?: string) => {
    const hub = findHubByNavPath(to)
    if (hub && visibleHubTabs(hub, pluginFlags).length >= 2) {
      return renderHubNav(hub, iconKey, showPin)
    }
    return renderLink(to, label, iconKey, showPin, pinPath)
  }

  return (
    <>
      <Link
        to={adminUrl()}
        onClick={onNavigate}
        className={`block min-w-0 max-w-full overflow-hidden ${collapsed ? 'px-0' : ''}`}
        title={t.cmsFull}
      >
        {collapsed ? (
          <BrandLogo variant="mini" className="mx-auto h-8 w-8" />
        ) : (
          <BrandLogo
            variant="full2"
            className="h-auto max-h-14 w-auto max-w-full object-left"
          />
        )}
      </Link>
      {!collapsed && (
        <p className="mt-1 text-xs text-zinc-500">{userName ?? t.administrator} · {role ?? 'admin'}</p>
      )}

      <nav className={`mt-6 space-y-5 ${collapsed ? 'mt-8 space-y-1' : ''}`}>
        {!!pinned.length && (
          <section>
            {!collapsed && (
              <p className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-widest text-zinc-600">{t.pinned}</p>
            )}
            {pinned.map((to) => {
              const navItem = findNavEntry(groupedNav, to)
              if (navItem) return renderNavItem(navItem.path, navItem.label, navItem.icon, true, to)
              // Legacy deep pin under a hub — only if that hub's plugin is still in nav.
              const hub = findHubByPath(to)
              if (!hub || !findNavEntry(groupedNav, hub.navPath)) return null
              const hubPin = resolveHubPin(to)
              if (!hubPin) return null
              return renderNavItem(hubPin.path, hubPin.label, hubPin.icon, true, to)
            })}
          </section>
        )}
        {Object.entries(groupedNav).map(([group, items]) => {
          const visible = (items ?? []).filter((it) => !pinSet.has(it.path))
          if (!visible.length) return null
          return (
            <section key={group}>
              {!collapsed && (
                <p className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-widest text-zinc-600">{translateNavGroup(group)}</p>
              )}
              {visible.map((it) => renderNavItem(it.path, it.label, it.icon, true))}
            </section>
          )
        })}
      </nav>

      <AdminLocaleSwitcher collapsed={collapsed} />
      <a
        href="/"
        target="_blank"
        rel="noreferrer"
        onClick={onNavigate}
        title={collapsed ? t.viewSite : undefined}
        className={`mt-3 flex items-center gap-2 text-sm text-zinc-500 hover:text-white ${collapsed ? 'justify-center px-0' : 'px-3'}`}
      >
        <ExternalLink size={16} />
        {!collapsed && t.viewSite}
      </a>
      <button
        type="button"
        onClick={() => { onNavigate?.(); logout() }}
        title={collapsed ? t.signOut : undefined}
        className={`mt-2 flex items-center gap-2 text-sm text-zinc-500 hover:text-white ${collapsed ? 'justify-center px-0' : 'px-3'}`}
      >
        <LogOut size={16} />
        {!collapsed && t.signOut}
      </button>
    </>
  )
}

type NavEntry = { path: string; label: string; icon?: string }
type GroupedNav = Record<string, NavEntry[] | undefined>

/** Find a nav entry by path across all groups (for pinned items). */
function findNavEntry(grouped: GroupedNav, path: string): NavEntry | undefined {
  for (const items of Object.values(grouped)) {
    const found = (items ?? []).find((it) => it.path === path)
    if (found) return found
  }
  return undefined
}

export function AdminShell() {
  const [menuOpen, setMenuOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(readSidebarCollapsed)
  const [pinned, setPinned] = useState(readPinnedNav)
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const location = useLocation()

  const toggleCollapsed = useCallback(() => {
    setCollapsed((v) => {
      const next = !v
      writeSidebarCollapsed(next)
      return next
    })
  }, [])

  const togglePin = useCallback((path: string) => {
    setPinned((prev) => {
      const next = prev.includes(path) ? prev.filter((p) => p !== path) : [...prev, path].slice(0, 8)
      writePinnedNav(next)
      return next
    })
  }, [])

  useEffect(() => {
    setMenuOpen(false)
  }, [location.pathname])

  useEffect(() => {
    document.body.style.overflow = menuOpen ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [menuOpen])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMenuOpen(false)
        setShortcutsOpen(false)
        return
      }
      if (isTypingTarget(e.target)) return
      // Physical keys — works on EN and RU layouts (BracketLeft = [ / х, Slash = / / .)
      if (e.code === 'BracketLeft' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault()
        toggleCollapsed()
      }
      if (e.code === 'Slash' && e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault()
        setShortcutsOpen((v) => !v)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [toggleCollapsed])

  useEffect(() => {
    const onToggle = () => toggleCollapsed()
    window.addEventListener('admin:toggle-sidebar', onToggle)
    return () => window.removeEventListener('admin:toggle-sidebar', onToggle)
  }, [toggleCollapsed])

  // Fetch plugin enable/disable state once so the sidebar hides disabled plugins.
  useEffect(() => {
    let cancelled = false
    api.get<{ data: PluginState[] }>('/admin/plugins')
      .then((res) => {
        if (cancelled) return
        const list = (res as { data?: PluginState[] })?.data ?? (res as unknown as PluginState[])
        if (Array.isArray(list)) setPluginStates(list)
      })
      .catch(() => {
        // Keep fail-closed: SiteContext /site.enabled_plugins usually hydrates.
        // If both fail, optional modules stay hidden (CORE_BOOT_PLUGINS only).
      })
    // Refresh HttpOnly media cookie for sessions started before cookie support.
    void endpoints.me().catch(() => { /* ignore */ })
    return () => { cancelled = true }
  }, [])

  const asideWidth = collapsed ? 'md:w-[4.25rem]' : 'md:w-64'
  const mainPad = collapsed ? 'md:pl-[4.25rem]' : 'md:pl-64'

  return (
    <div className="admin-shell min-h-screen bg-[#0a0a0b] text-zinc-100">
      <aside
        className={`fixed inset-y-0 left-0 z-30 hidden overflow-x-hidden overflow-y-auto border-r border-white/10 bg-[#101012] transition-[width] duration-200 md:block ${asideWidth} ${collapsed ? 'p-2.5' : 'p-5'}`}
      >
        <div className={`mb-3 flex ${collapsed ? 'justify-center' : 'justify-end'}`}>
          <button
            type="button"
            onClick={toggleCollapsed}
            title={collapsed ? t.expandSidebar : t.collapseSidebar}
            aria-label={collapsed ? t.expandSidebar : t.collapseSidebar}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 text-zinc-400 hover:bg-white/5 hover:text-white"
          >
            {collapsed ? <PanelLeft size={16} /> : <PanelLeftClose size={16} />}
          </button>
        </div>
        <AdminNav collapsed={collapsed} pinned={pinned} onTogglePin={togglePin} />
      </aside>

      {menuOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <button
            type="button"
            aria-label="Закрыть меню"
            className="absolute inset-0 bg-black/60"
            onClick={() => setMenuOpen(false)}
          />
          <aside className="absolute inset-y-0 left-0 flex w-[min(18rem,88vw)] max-w-full flex-col overflow-x-hidden overflow-y-auto border-r border-white/10 bg-[#101012] p-4 shadow-2xl sm:p-5">
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="text-xs font-semibold uppercase tracking-widest text-zinc-600">Меню</span>
              <button
                type="button"
                aria-label="Закрыть меню"
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/10 text-zinc-300 hover:bg-white/5 hover:text-white"
                onClick={() => setMenuOpen(false)}
              >
                <X size={18} />
              </button>
            </div>
            <AdminNav
              onNavigate={() => setMenuOpen(false)}
              pinned={pinned}
              onTogglePin={togglePin}
            />
          </aside>
        </div>
      )}

      <div className={`transition-[padding] duration-200 ${mainPad}`}>
        <header className="sticky top-0 z-20 flex h-14 items-center justify-between gap-2 overflow-x-clip border-b border-white/10 bg-[#0a0a0b]/90 px-3 backdrop-blur sm:h-16 sm:gap-3 sm:px-6">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <button
              type="button"
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-white/10 text-zinc-200 hover:bg-white/5 md:hidden"
              aria-label={menuOpen ? 'Закрыть меню' : 'Открыть меню'}
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((v) => !v)}
            >
              {menuOpen ? <X size={18} /> : <Menu size={18} />}
            </button>
            <Link
              to={adminUrl()}
              className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden md:hidden"
              title={t.cmsFull}
            >
              <BrandLogo variant="mini" className="h-7 w-7" />
            </Link>
            <span className="hidden truncate text-sm text-zinc-400 md:inline">{t.contentWorkspace}</span>
          </div>
          <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
            <button
              type="button"
              onClick={() => setShortcutsOpen(true)}
              title={t.shortcuts}
              aria-label={t.shortcuts}
              className="hidden h-9 w-9 items-center justify-center rounded-lg border border-white/10 text-zinc-400 hover:bg-white/5 hover:text-white sm:inline-flex"
            >
              <Keyboard size={15} />
            </button>
            <a
              href="/"
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-zinc-300 transition hover:bg-white/10 hover:text-white sm:w-auto sm:gap-1.5 sm:px-3"
              title={t.viewSite}
              aria-label={t.viewSite}
            >
              <ExternalLink size={15} />
              <span className="hidden sm:inline">{t.viewSite}</span>
            </a>
            <GlobalSearch />
            <NotificationsBell />
          </div>
        </header>
        <MigrationBanner />
        <main className="overflow-x-clip p-4 sm:p-5 lg:px-8 lg:py-6">
          <AdminHubTabs />
          <Outlet />
        </main>
      </div>

      <ShortcutsHelp open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
    </div>
  )
}

/** Классический логин — fallback, если шаблон admin-login ещё без layout. */
function ClassicLoginFallback() {
  const { login, verify2fa, role } = useAuth()
  const navigate = useNavigate()
  const [error, setError] = useState('')
  const [challenge, setChallenge] = useState<string | null>(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [otp, setOtp] = useState('')

  const goAfterLogin = () => {
    const r = localStorage.getItem('user_role') || role || ''
    if (!['super_admin', 'admin', 'editor'].includes(r)) {
      navigate('/')
      return
    }
    const next = new URLSearchParams(window.location.search).get('next')
    const nextPath = next?.split('?')[0] || ''
    const dest = next && isAdminPathname(nextPath) && !nextPath.endsWith('/login')
      ? next
      : adminUrl()
    navigate(dest)
  }

  const goBackToPassword = () => {
    setChallenge(null)
    setOtp('')
    setPassword('')
    setError('')
  }

  return (
    <Container className="flex min-h-screen max-w-md items-center">
      {challenge ? (
        <form
          key="login-2fa"
          className="w-full space-y-4"
          autoComplete="off"
          onSubmit={async (e) => {
            e.preventDefault()
            try {
              await verify2fa(challenge, otp.trim())
              setOtp('')
              goAfterLogin()
            } catch (x) {
              setOtp('')
              setError(x instanceof Error ? x.message : t.unableToSignIn)
            }
          }}
        >
          <div className="mb-2 flex justify-center">
            <BrandLogo variant="full" className="h-10 w-auto max-w-[14rem] object-contain" />
          </div>
          <h1 className="font-heading text-center text-2xl">{t.twoFactorTitle}</h1>
          <p className="text-sm text-zinc-400">{t.twoFactorHint}</p>
          <div aria-hidden className="pointer-events-none absolute -left-[9999px] h-0 w-0 overflow-hidden opacity-0">
            <input type="text" name="username" autoComplete="username" value={email} readOnly tabIndex={-1} />
            <input type="password" name="password" autoComplete="current-password" value="" readOnly tabIndex={-1} />
          </div>
          <input
            name="otp"
            type="text"
            inputMode="numeric"
            pattern="[0-9]{6}"
            maxLength={6}
            autoComplete="one-time-code"
            required
            value={otp}
            onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder={t.twoFactorCode}
            className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 tracking-widest"
          />
          {error && <p className="text-sm text-red-400">{error}</p>}
          <Button className="w-full">{t.signIn}</Button>
          <button type="button" className="w-full text-sm text-zinc-500 underline" onClick={goBackToPassword}>
            {t.twoFactorBack}
          </button>
        </form>
      ) : (
        <form
          key="login-password"
          className="w-full space-y-4"
          onSubmit={async (e) => {
            e.preventDefault()
            try {
              const result = await login(email, password)
              setPassword('')
              if (result.requires_2fa) {
                setOtp('')
                setChallenge(result.challenge_token)
                setError('')
                return
              }
              goAfterLogin()
            } catch (x) {
              setPassword('')
              setError(x instanceof Error ? x.message : t.unableToSignIn)
            }
          }}
        >
          <div className="mb-2 flex justify-center">
            <BrandLogo variant="full" className="h-10 w-auto max-w-[14rem] object-contain" />
          </div>
          <h1 className="font-heading text-center text-2xl">{t.signInTitle}</h1>
          <input
            name="email"
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={t.email}
            className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3"
          />
          <input
            name="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={t.password}
            className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3"
          />
          {error && <p className="text-sm text-red-400">{error}</p>}
          <Button className="w-full">{t.signIn}</Button>
          <p className="text-center text-sm text-zinc-500">
            Нет аккаунта?{' '}
            <a href="/register" className="underline hover:text-zinc-300">Регистрация</a>
          </p>
        </form>
      )}
    </Container>
  )
}

/** Вход: шаблон admin-login из билдера, иначе классическая форма. */
export function LoginPage() {
  return (
    <div className="admin-shell min-h-screen bg-[var(--background,#0a0a0b)] text-[var(--text,#f4f6fa)]">
      <ThemeApplier />
      <SiteTemplateInjector />
      <PreferCmsLayout slug="admin-login" seoPath={adminUrl('/login')} fallback={<ClassicLoginFallback />} />
    </div>
  )
}

export { DashboardPage } from '@/admin/pages/DashboardPage'

export { CrudListPage, CrudEditPage, ProfilePage, ProjectEditPage, BlogEditPage } from '@/admin/pages/AdminPages'
export { SingletonPage, ThemeSettingsPage, HomepagePage, HomepageEditPage } from '@/admin/pages/SitePages'
export { MediaLibraryPage, ContactMessagesPage, BackupPage, PasswordPage, UpdatesPage } from '@/admin/pages/UtilityPages'
export { TrashPage, ActivityPage, SystemStatusPage } from '@/admin/pages/EnterprisePages'
