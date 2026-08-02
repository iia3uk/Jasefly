import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import type { LucideIcon } from 'lucide-react'
import {
  Pin, Settings, Globe, ShoppingCart, MessageSquare, Users,
  Shield, Webhook, Code2, Package, Layers, Newspaper,
} from 'lucide-react'
import { adminUrl, getAdminBase, toCanonicalAdminPath } from '@/admin/adminBasePath'
import { isHubNavActive, type AdminHub } from '@/admin/adminHubs'
import { formatAttentionBadge, type NavAttentionMap } from '@/admin/hooks/useAdminNavAttention'

export type NerveNavItem = {
  path: string
  label: string
  iconKey?: string
  Icon: LucideIcon
  hub?: AdminHub
  tabCount?: number
}

export type NerveNavGroup = {
  key: string
  title: string
  items: NerveNavItem[]
}

export type MosaicNavItem = NerveNavItem
export type MosaicNavGroup = NerveNavGroup

function groupHue(key: string): number {
  let h = 0
  for (let i = 0; i < key.length; i++) h = (h * 33 + key.charCodeAt(i)) >>> 0
  return h % 360
}

const GROUP_ICONS: Record<string, LucideIcon> = {
  Система: Settings,
  Сайт: Globe,
  Контент: Newspaper,
  Коммерция: ShoppingCart,
  Коммуникации: MessageSquare,
  Пользователи: Users,
  Безопасность: Shield,
  Интеграции: Webhook,
  Разработка: Code2,
  Модули: Package,
  Прочее: Layers,
  System: Settings,
  Site: Globe,
  Content: Newspaper,
  Commerce: ShoppingCart,
  Communications: MessageSquare,
  Users: Users,
  Security: Shield,
  Integrations: Webhook,
  Develop: Code2,
  Modules: Package,
  Other: Layers,
}

const CLUSTER_RULES: Record<string, Array<{ title: string; paths: string[] }>> = {
  Система: [
    { title: 'Управление', paths: ['/admin/plugins', '/admin/modules', '/admin/updates'] },
    { title: 'Состояние', paths: ['/admin/system', '/admin/overload', '/admin/analytics', '/admin/activity'] },
    { title: 'Данные', paths: ['/admin/trash', '/admin/backup'] },
    { title: 'Доступ', paths: ['/admin/password', '/admin/site-settings', '/admin/mail'] },
    { title: 'Автоматика', paths: ['/admin/scheduler', '/admin/automations'] },
  ],
  Сайт: [
    { title: 'Страницы', paths: ['/admin/pages', '/admin/hero', '/admin/messages'] },
    { title: 'Сервисы', paths: ['/admin/translate', '/admin/media', '/admin/seo', '/admin/redirects'] },
  ],
  Контент: [
    { title: 'Портфолио', paths: ['/admin/profile', '/admin/projects', '/admin/services'] },
    { title: 'Публикации', paths: ['/admin/blog', '/admin/forms'] },
  ],
  Коммуникации: [
    { title: 'Поддержка', paths: ['/admin/support', '/admin/support/faq'] },
    { title: 'Каналы', paths: ['/admin/comments', '/admin/notifications', '/admin/newsletter/subscribers', '/admin/newsletter/campaigns'] },
  ],
}

function pathInGroup(group: NerveNavGroup, pathname: string): boolean {
  const path = toCanonicalAdminPath(pathname)
  return group.items.some((it) => {
    if (it.hub && isHubNavActive(it.hub.navPath, pathname)) return true
    const p = toCanonicalAdminPath(it.path)
    return path === p || path.startsWith(`${p}/`)
  })
}

function clusterItems(groupKey: string, items: NerveNavItem[]): Array<{ title: string | null; items: NerveNavItem[] }> {
  const rules = CLUSTER_RULES[groupKey]
  if (!rules || items.length < 6) return [{ title: null, items }]

  const used = new Set<string>()
  const out: Array<{ title: string | null; items: NerveNavItem[] }> = []

  for (const rule of rules) {
    const bucket = items.filter((it) => {
      const p = toCanonicalAdminPath(it.path)
      return rule.paths.some((rp) => p === rp || p.startsWith(`${rp}/`))
    })
    if (!bucket.length) continue
    for (const it of bucket) used.add(toCanonicalAdminPath(it.path))
    out.push({ title: rule.title, items: bucket })
  }

  const rest = items.filter((it) => !used.has(toCanonicalAdminPath(it.path)))
  if (rest.length) out.push({ title: out.length ? 'Ещё' : null, items: rest })
  return out.length ? out : [{ title: null, items }]
}

/**
 * Lattice variant: same hub consolidations.
 * Icon-only hub dock on top + 2-column tile grid (less vertical scroll).
 */
function attentionForPath(map: NavAttentionMap, path: string): number {
  return map[toCanonicalAdminPath(path)] ?? 0
}

function groupAttention(map: NavAttentionMap, group: NerveNavGroup): number {
  return group.items.reduce((sum, it) => sum + attentionForPath(map, it.path), 0)
}

export function AdminNavNerve({
  groups,
  pinnedPaths,
  attention = {},
  onNavigate,
  onTogglePin,
  header,
  footer,
}: {
  groups: NerveNavGroup[]
  pinnedPaths: Set<string>
  attention?: NavAttentionMap
  onNavigate?: () => void
  onTogglePin: (path: string) => void
  header?: ReactNode
  footer?: ReactNode
}) {
  const location = useLocation()
  const gid = useId()
  const stripRef = useRef<HTMLDivElement>(null)

  const visibleGroups = useMemo(
    () => groups.filter((g) => g.items.length > 0),
    [groups],
  )

  const activeKey = useMemo(() => {
    for (const g of visibleGroups) {
      if (pathInGroup(g, location.pathname)) return g.key
    }
    return visibleGroups[0]?.key ?? null
  }, [visibleGroups, location.pathname])

  const [openKey, setOpenKey] = useState<string | null>(activeKey)

  useEffect(() => {
    if (activeKey) setOpenKey(activeKey)
  }, [activeKey])

  useEffect(() => {
    if (!openKey || !stripRef.current) return
    const el = stripRef.current.querySelector<HTMLElement>(`[data-hub-key="${openKey}"]`)
    el?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' })
  }, [openKey])

  const openGroup = visibleGroups.find((g) => g.key === openKey) ?? visibleGroups[0] ?? null
  const hue = openGroup ? groupHue(openGroup.key) : 210
  const clusters = openGroup ? clusterItems(openGroup.key, openGroup.items) : []

  return (
    <div className="admin-nav-lattice flex min-h-0 flex-1 flex-col">
      <div className="shrink-0">{header}</div>

      {/* Icon dock — one row */}
      <div
        ref={stripRef}
        className="admin-nav-strip mt-2.5 flex shrink-0 justify-between gap-0.5"
        role="tablist"
        aria-label="Разделы меню"
      >
        {visibleGroups.map((group) => {
          const gHue = groupHue(group.key)
          const selected = openKey === group.key
          const hasActive = pathInGroup(group, location.pathname)
          const LeadIcon = GROUP_ICONS[group.key] ?? GROUP_ICONS[group.title] ?? group.items[0]?.Icon
          const hubBadge = formatAttentionBadge(groupAttention(attention, group))
          return (
            <button
              key={`${gid}-hub-${group.key}`}
              type="button"
              role="tab"
              data-hub-key={group.key}
              aria-selected={selected}
              title={hubBadge ? `${group.title} · ${hubBadge}` : group.title}
              onClick={() => setOpenKey(group.key)}
              className={[
                'relative flex h-9 min-w-0 flex-1 items-center justify-center rounded-lg border transition',
                selected
                  ? 'border-white/25 text-white'
                  : 'border-transparent text-zinc-500 hover:border-white/10 hover:bg-white/[0.04] hover:text-zinc-200',
              ].join(' ')}
              style={{
                background: selected
                  ? `linear-gradient(160deg, hsla(${gHue},55%,34%,0.75), hsla(${gHue},40%,14%,0.55))`
                  : hasActive
                    ? `hsla(${gHue},40%,18%,0.4)`
                    : 'transparent',
              }}
            >
              {LeadIcon ? <LeadIcon size={16} strokeWidth={1.75} /> : (
                <span className="text-[10px] font-semibold">{group.title.slice(0, 1)}</span>
              )}
              {hubBadge ? (
                <span className="admin-nav-loot absolute -right-0.5 -top-0.5 min-w-[1rem] rounded-full px-1 text-center text-[9px] font-bold leading-[1rem]">
                  {hubBadge}
                </span>
              ) : null}
              {hasActive && !selected ? (
                <span
                  className="absolute bottom-0.5 left-1/2 h-0.5 w-3 -translate-x-1/2 rounded-full"
                  style={{ background: `hsl(${gHue},65%,55%)` }}
                  aria-hidden
                />
              ) : null}
            </button>
          )
        })}
      </div>

      <p className="mt-2 shrink-0 truncate px-0.5 text-[10px] font-semibold uppercase tracking-[0.14em]" style={{ color: `hsl(${hue},45%,70%)` }}>
        {openGroup?.title ?? ''}
      </p>

      {/* 2-col tile lattice */}
      <div
        className="mt-1.5 min-h-0 flex-1 overflow-y-auto rounded-xl border border-white/[0.07] p-1.5"
        style={{
          background: `
            radial-gradient(100% 60% at 50% 0%, hsla(${hue},50%,40%,0.1), transparent 55%),
            rgba(0,0,0,0.22)
          `,
        }}
        role="tabpanel"
      >
        {clusters.map((cluster, ci) => (
          <div key={`${openGroup?.key ?? 'g'}-c-${ci}`} className={ci > 0 ? 'mt-2' : ''}>
            {cluster.title ? (
              <p className="mb-1 px-1 text-[10px] font-medium uppercase tracking-wider text-zinc-600">
                {cluster.title}
              </p>
            ) : null}
            <ul className="grid grid-cols-2 gap-1">
              {cluster.items.map((it) => {
                const canon = toCanonicalAdminPath(it.path)
                const isPinned = pinnedPaths.has(canon) || pinnedPaths.has(it.path)
                const hubActive = it.hub ? isHubNavActive(it.hub.navPath, location.pathname) : false
                const href = adminUrl(it.path)
                const Icon = it.Icon
                const badge = formatAttentionBadge(attentionForPath(attention, it.path))
                return (
                  <li key={it.path} className="min-w-0">
                    <NavLink
                      to={href}
                      end={canon === '/admin' || href === `/${getAdminBase()}`}
                      title={badge ? `${it.label} · ${badge}` : it.label}
                      onClick={onNavigate}
                      onContextMenu={(e) => {
                        e.preventDefault()
                        onTogglePin(canon)
                      }}
                      className={({ isActive }) => {
                        const on = isActive || hubActive
                        return [
                          'relative flex h-full min-h-[3.25rem] flex-col items-start justify-center gap-1 rounded-lg border px-2 py-1.5 transition',
                          on
                            ? 'border-white/20 bg-white/[0.08] text-white'
                            : 'border-white/[0.05] bg-white/[0.02] text-zinc-400 hover:border-white/12 hover:bg-white/[0.05] hover:text-zinc-100',
                        ].join(' ')
                      }}
                    >
                      {badge ? (
                        <span className="admin-nav-loot absolute right-1 top-1 min-w-[1.05rem] rounded-full px-1 text-center text-[9px] font-bold leading-[1.05rem]">
                          {badge}
                        </span>
                      ) : null}
                      <span className="flex w-full items-center gap-1.5 pr-4">
                        <Icon size={14} strokeWidth={1.8} className="shrink-0 opacity-90" />
                        {isPinned ? (
                          <Pin size={10} className="ml-auto shrink-0 text-[var(--accent)]" fill="currentColor" />
                        ) : null}
                      </span>
                      <span className="line-clamp-2 w-full text-[11px] font-medium leading-tight">{it.label}</span>
                    </NavLink>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </div>

      <div className="mt-2 shrink-0">{footer}</div>
    </div>
  )
}

export function AdminNavMosaic(props: Parameters<typeof AdminNavNerve>[0]) {
  return <AdminNavNerve {...props} />
}
