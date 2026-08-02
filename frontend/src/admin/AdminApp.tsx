import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  LogOut, X, ExternalLink, PanelLeftClose, PanelLeft, Pin, PinOff, Keyboard, ChevronDown, Menu,
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
import { AdminNavNerve, type NerveNavGroup } from '@/admin/components/AdminNavNerve'
import { adminUrl, getAdminBase, isAdminPathname, toCanonicalAdminPath } from '@/admin/adminBasePath'
import { resolveNavIcon } from '@/admin/navIcons'
import { formatAttentionBadge, useAdminNavAttention } from '@/admin/hooks/useAdminNavAttention'
import { api, endpoints } from '@/lib/api'
import { usePluginEnabled } from '@/hooks/useApi'
import { NotificationsBell } from '@/modules/notifications/NotificationsBell'

function resolveIcon(path: string, iconKey?: string) {
  return resolveNavIcon(path, iconKey)
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
  const attention = useAdminNavAttention()
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
      const visible = (items ?? []).filter((it) => {
        const cap = (it as { capability?: string }).capability || it.permission
        return !cap || can(cap)
      })
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

  const attentionFor = (path: string) => attention[toCanonicalAdminPath(path)] ?? 0

  const renderLink = (to: string, label: string, iconKey?: string, showPin?: boolean, pinPath?: string) => {
    const href = adminUrl(to)
    const Icon = resolveIcon(to, iconKey)
    const pinKey = pinPath ?? to
    const isPinned = pinSet.has(toCanonicalAdminPath(pinKey)) || pinSet.has(pinKey)
    const displayLabel = resolveDisplayLabel(to, label)
    const badge = formatAttentionBadge(attentionFor(to))
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
          <span className="relative shrink-0">
            <Icon size={16} className="shrink-0" />
            {badge && collapsed ? (
              <span className="admin-nav-loot absolute -right-1.5 -top-1.5 min-w-[1rem] rounded-full px-1 text-center text-[9px] font-bold leading-[1rem]">
                {badge}
              </span>
            ) : null}
          </span>
          {!collapsed && <span className="min-w-0 flex-1 truncate">{displayLabel}</span>}
          {!collapsed && badge ? (
            <span className="admin-nav-loot ml-auto min-w-[1.15rem] shrink-0 rounded-full px-1.5 text-center text-[10px] font-bold leading-[1.15rem]">
              {badge}
            </span>
          ) : null}
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

  const mosaicGroups = useMemo((): NerveNavGroup[] => {
    const out: NerveNavGroup[] = []
    const pinnedItems: NerveNavGroup['items'] = []
    for (const to of pinned) {
      const navItem = findNavEntry(groupedNav, to)
      if (navItem) {
        pinnedItems.push({
          path: navItem.path,
          label: resolveDisplayLabel(navItem.path, navItem.label),
          iconKey: navItem.icon,
          Icon: resolveIcon(navItem.path, navItem.icon),
        })
        continue
      }
      const hub = findHubByPath(to)
      if (!hub || !findNavEntry(groupedNav, hub.navPath)) continue
      const hubPin = resolveHubPin(to)
      if (!hubPin) continue
      pinnedItems.push({
        path: hubPin.path,
        label: hubPin.label,
        iconKey: hubPin.icon,
        Icon: resolveIcon(hubPin.path, hubPin.icon),
        hub,
        tabCount: visibleHubTabs(hub, pluginFlags).length,
      })
    }
    if (pinnedItems.length) {
      out.push({ key: '__pinned', title: t.pinned, items: pinnedItems })
    }
    for (const [group, items] of Object.entries(groupedNav)) {
      const visible = (items ?? []).filter((it) => !pinSet.has(it.path) && !pinSet.has(toCanonicalAdminPath(it.path)))
      if (!visible.length) continue
      out.push({
        key: group,
        title: translateNavGroup(group),
        items: visible.map((it) => {
          const hub = findHubByNavPath(it.path)
          const tabs = hub ? visibleHubTabs(hub, pluginFlags) : []
          return {
            path: it.path,
            label: resolveDisplayLabel(it.path, it.label),
            iconKey: it.icon,
            Icon: resolveIcon(it.path, it.icon),
            hub: tabs.length >= 2 ? hub : undefined,
            tabCount: tabs.length,
          }
        }),
      })
    }
    return out
  }, [groupedNav, pinned, pinSet, pluginFlags, locale])

  const footerActions = (
    <>
      <AdminLocaleSwitcher collapsed={collapsed} />
      <a
        href="/"
        target="_blank"
        rel="noreferrer"
        onClick={onNavigate}
        title={t.viewSite}
        className={`mt-2 flex items-center gap-2 text-sm text-zinc-500 hover:text-white ${collapsed ? 'rounded-lg px-2 py-1.5 hover:bg-white/5' : 'px-3'}`}
      >
        <ExternalLink size={16} />
        <span>{t.viewSite}</span>
      </a>
      <button
        type="button"
        onClick={() => { onNavigate?.(); logout() }}
        title={t.signOut}
        className={`mt-1 flex w-full items-center gap-2 text-sm text-zinc-500 hover:text-white ${collapsed ? 'rounded-lg px-2 py-1.5 hover:bg-white/5' : 'px-3'}`}
      >
        <LogOut size={16} />
        <span>{t.signOut}</span>
      </button>
    </>
  )

  if (collapsed) {
    return (
      <AdminNavNerve
        groups={mosaicGroups}
        pinnedPaths={pinSet}
        attention={attention}
        onNavigate={onNavigate}
        onTogglePin={onTogglePin}
        header={(
          <div className="flex items-center gap-2 px-0.5">
            <Link
              to={adminUrl()}
              onClick={onNavigate}
              className="block w-9 shrink-0 overflow-hidden"
              title={t.cmsFull}
            >
              <BrandLogo variant="mini" className="h-9 w-9" />
            </Link>
            <div className="min-w-0">
              <p className="truncate text-xs font-medium text-zinc-200">{userName ?? t.administrator}</p>
              <p className="truncate text-[10px] text-zinc-600">{role ?? 'admin'}</p>
            </div>
          </div>
        )}
        footer={footerActions}
      />
    )
  }

  return (
    <>
      <Link
        to={adminUrl()}
        onClick={onNavigate}
        className="block min-w-0 max-w-full overflow-hidden"
        title={t.cmsFull}
      >
        <BrandLogo
          variant="full2"
          className="h-auto max-h-14 w-auto max-w-full object-left"
        />
      </Link>
      <p className="mt-1 text-xs text-zinc-500">{userName ?? t.administrator} · {role ?? 'admin'}</p>

      <nav className="mt-6 space-y-5">
        {!!pinned.length && (
          <section>
            <p className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-widest text-zinc-600">{t.pinned}</p>
            {pinned.map((to) => {
              const navItem = findNavEntry(groupedNav, to)
              if (navItem) return renderNavItem(navItem.path, navItem.label, navItem.icon, true, to)
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
              <p className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-widest text-zinc-600">{translateNavGroup(group)}</p>
              {visible.map((it) => renderNavItem(it.path, it.label, it.icon, true))}
            </section>
          )
        })}
      </nav>

      {footerActions}
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

  const asideWidth = collapsed ? 'md:w-[16.75rem]' : 'md:w-64'
  const mainPad = collapsed ? 'md:pl-[16.75rem]' : 'md:pl-64'

  return (
    <div className="admin-shell min-h-screen bg-[#0a0a0b] text-zinc-100">
      <aside
        className={`fixed inset-y-0 left-0 z-30 hidden border-r border-white/10 transition-[width] duration-200 md:flex md:flex-col ${asideWidth} ${
          collapsed
            ? 'admin-aside-shelf overflow-hidden bg-[#0e0e12] p-2.5'
            : 'overflow-x-hidden overflow-y-auto bg-[#101012] p-5'
        }`}
      >
        <div className={`mb-2 flex shrink-0 ${collapsed ? 'justify-center' : 'justify-end'}`}>
          <button
            type="button"
            onClick={toggleCollapsed}
            title={collapsed ? t.expandSidebar : t.collapseSidebar}
            aria-label={collapsed ? t.expandSidebar : t.collapseSidebar}
            className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 text-zinc-400 hover:bg-white/5 hover:text-white"
          >
            {collapsed ? <PanelLeft size={16} /> : <PanelLeftClose size={16} />}
          </button>
        </div>
        <div className={collapsed ? 'flex min-h-0 flex-1 flex-col' : ''}>
          <AdminNav collapsed={collapsed} pinned={pinned} onTogglePin={togglePin} />
        </div>
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

export { CrudListPage, CrudEditPage, ProfilePage, ProjectEditPage } from '@/admin/pages/AdminPages'
export { BlogEditPage } from '@/modules/blog/admin/BlogEditPage'
export { SingletonPage, ThemeSettingsPage, HomepagePage, HomepageEditPage } from '@/admin/pages/SitePages'
export { MediaLibraryPage, ContactMessagesPage, BackupPage, PasswordPage, UpdatesPage } from '@/admin/pages/UtilityPages'
export { TrashPage, ActivityPage, SystemStatusPage } from '@/admin/pages/EnterprisePages'
