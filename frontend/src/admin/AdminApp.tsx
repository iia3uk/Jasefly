import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  LogOut, X, ExternalLink, Keyboard, Menu,
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
import { readPinnedNav, writePinnedNav } from '@/admin/lib/prefs'
import { getAdminNavGrouped, hydrateDemoPlugins, setPluginStates, subscribePluginState, type PluginState } from '@/core/moduleRegistry'
import {
  findHubByNavPath,
  findHubByPath,
  resolveHubPin,
  visibleHubTabs,
} from '@/admin/adminHubs'
import { AdminHubTabs } from '@/admin/components/AdminHubTabs'
import { AdminNavNerve, type NerveNavGroup } from '@/admin/components/AdminNavNerve'
import { adminUrl, isAdminPathname, toCanonicalAdminPath } from '@/admin/adminBasePath'
import { resolveNavIcon } from '@/admin/navIcons'
import { useAdminNavAttention } from '@/admin/hooks/useAdminNavAttention'
import { api, endpoints } from '@/lib/api'
import { usePluginEnabled } from '@/hooks/useApi'
import { NotificationsBell } from '@/modules/notifications/NotificationsBell'
import { DemoSandboxBanner } from '@/admin/demo/DemoSandboxBanner'
import { demoModeForPath } from '@/admin/demo/demoNav'

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
  pinned,
  onTogglePin,
}: {
  onNavigate?: () => void
  pinned: string[]
  onTogglePin: (path: string) => void
}) {
  const { logout, can, isDemo } = useAuth()
  const { locale } = useAdminLocale()
  const pinSet = useMemo(() => new Set(pinned), [pinned])
  const productsOn = usePluginEnabled('products')
  const paymentsOn = usePluginEnabled('payments')
  const ordersOn = usePluginEnabled('orders')
  const pluginFlags = useMemo(
    () => ({ products: productsOn, payments: paymentsOn, orders: ordersOn }),
    [productsOn, paymentsOn, ordersOn],
  )
  const attention = useAdminNavAttention()

  const [navTick, setNavTick] = useState(0)
  useEffect(() => subscribePluginState(() => setNavTick((n) => n + 1)), [])

  const groupedNav = useMemo(() => {
    void locale
    const raw = getAdminNavGrouped()
    const filtered: typeof raw = {}
    for (const [group, items] of Object.entries(raw)) {
      const visible = (items ?? []).filter((it) => {
        const cap = (it as { capability?: string }).capability || it.permission
        if (cap && !can(cap)) return false
        if (isDemo && demoModeForPath(String(it.path || '')) === 'hidden') return false
        return true
      })
      if (visible.length) filtered[group] = visible
    }
    return filtered
  }, [navTick, can, locale, isDemo])

  const resolveDisplayLabel = (to: string, label: string) => {
    const hub = findHubByNavPath(to)
    if (hub) return hub.navLabel
    const canon = toCanonicalAdminPath(to)
    const seg = canon.replace(/^\/admin\/?/, '').split('/')[0] || ''
    const translated = seg ? resourceTitle(seg) : label
    return translated !== seg.replace(/-/g, ' ') ? translated : label
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
      <a
        href="/"
        target="_blank"
        rel="noreferrer"
        onClick={onNavigate}
        title={t.viewSite}
        className="mt-2 flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-zinc-500 hover:bg-white/5 hover:text-white"
      >
        <ExternalLink size={16} />
        <span>{t.viewSite}</span>
      </a>
      <button
        type="button"
        onClick={() => { onNavigate?.(); logout() }}
        title={t.signOut}
        className="mt-1 flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-zinc-500 hover:bg-white/5 hover:text-white"
      >
        <LogOut size={16} />
        <span>{t.signOut}</span>
      </button>
    </>
  )

  return (
    <AdminNavNerve
      groups={mosaicGroups}
      pinnedPaths={pinSet}
      attention={attention}
      onNavigate={onNavigate}
      onTogglePin={onTogglePin}
      header={(
        <Link
          to={adminUrl()}
          onClick={onNavigate}
          className="block w-full"
          title={t.cmsFull}
          aria-label={t.cmsFull}
        >
          <BrandLogo
            variant="full2"
            className="!max-w-none h-auto w-full object-contain object-left"
          />
        </Link>
      )}
      footer={footerActions}
    />
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
  const [pinned, setPinned] = useState(readPinnedNav)
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const location = useLocation()

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
      if (e.code === 'Slash' && e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault()
        setShortcutsOpen((v) => !v)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const { isDemo } = useAuth()

  // Fetch plugin enable/disable state once so the sidebar hides disabled plugins.
  // Demo: enable every registered module so the full admin nav is visible (sandbox API still isolates writes).
  useEffect(() => {
    let cancelled = false
    if (isDemo) {
      hydrateDemoPlugins()
    } else {
      api.get<{ data: PluginState[] }>('/admin/plugins')
        .then((res) => {
          if (cancelled) return
          const list = (res as { data?: PluginState[] })?.data ?? (res as unknown as PluginState[])
          if (Array.isArray(list)) setPluginStates(list)
        })
        .catch(() => {
          // Keep fail-closed: SiteContext /site.enabled_plugins usually hydrates.
        })
    }
    // Refresh HttpOnly media cookie for sessions started before cookie support.
    void endpoints.me().catch(() => { /* ignore */ })
    return () => { cancelled = true }
  }, [isDemo])

  return (
    <div className="admin-shell relative min-h-screen w-full max-w-none bg-[#0a0a0b] text-zinc-100">
      <DemoSandboxBanner />
      <aside
        className={`admin-aside-shelf fixed bottom-0 left-0 z-30 hidden w-[16.75rem] overflow-hidden border-r border-white/10 bg-[#0e0e12] p-2.5 md:flex md:flex-col ${
          isDemo ? 'top-10' : 'top-0'
        }`}
      >
        <div className="flex min-h-0 flex-1 flex-col">
          <AdminNav pinned={pinned} onTogglePin={togglePin} />
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

      <div className="md:pl-[16.75rem]">
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
