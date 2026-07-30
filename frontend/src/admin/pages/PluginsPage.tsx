import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ChevronDown, FilePlus2, Info, Power, Puzzle, Save, Search, Settings2,
} from 'lucide-react'
import { api } from '@/lib/api'
import { Button, GlassPanel, Skeleton } from '@/components/ui'
import { AdminPageHero, AdminSectionLabel } from '@/admin/components/AdminPageHero'
import { t, useAdminLocale } from '@/admin/i18n'
import { setPluginEnabled, setPluginStates, type PluginState, type PluginSettingField } from '@/core/moduleRegistry'

/** Core plugins that cannot be disabled (mirrors backend guard). */
const CORE_PLUGINS = new Set(['system', 'users'])

const CATEGORY_ORDER = ['core', 'content', 'commerce', 'comms', 'security', 'integrations', 'other'] as const

function categoryFallback(key: string): string {
  const map: Record<string, string> = {
    core: t.pluginsCatCore,
    content: t.pluginsCatContent,
    commerce: t.pluginsCatCommerce,
    comms: t.pluginsCatComms,
    security: t.pluginsCatSecurity,
    integrations: t.pluginsCatIntegrations,
    other: t.pluginsCatOther,
  }
  return map[key] ?? key
}

/** Soft corner glow — not a solid header band (avoids muddy wash over text). */
const CATEGORY_GLOW: Record<string, string> = {
  core: 'radial-gradient(ellipse 70% 55% at 0% 0%, rgb(251 191 36 / 0.12), transparent 62%)',
  content: 'radial-gradient(ellipse 70% 55% at 0% 0%, rgb(45 212 191 / 0.14), transparent 62%)',
  commerce: 'radial-gradient(ellipse 70% 55% at 0% 0%, rgb(167 139 250 / 0.14), transparent 62%)',
  comms: 'radial-gradient(ellipse 70% 55% at 0% 0%, rgb(56 189 248 / 0.14), transparent 62%)',
  security: 'radial-gradient(ellipse 70% 55% at 0% 0%, rgb(251 113 133 / 0.12), transparent 62%)',
  integrations: 'radial-gradient(ellipse 70% 55% at 0% 0%, rgb(129 140 248 / 0.14), transparent 62%)',
  other: 'radial-gradient(ellipse 70% 55% at 0% 0%, rgb(161 161 170 / 0.1), transparent 62%)',
}

const CATEGORY_ICON: Record<string, string> = {
  core: 'border-amber-400/30 bg-amber-500/10 text-amber-200',
  content: 'border-teal-400/30 bg-teal-500/10 text-teal-200',
  commerce: 'border-violet-400/30 bg-violet-500/10 text-violet-200',
  comms: 'border-sky-400/30 bg-sky-500/10 text-sky-200',
  security: 'border-rose-400/30 bg-rose-500/10 text-rose-200',
  integrations: 'border-indigo-400/30 bg-indigo-500/10 text-indigo-200',
  other: 'border-white/10 bg-white/[0.04] text-zinc-400',
}

type PluginsResponse = { data: PluginState[] }
type StatusFilter = 'all' | 'on' | 'off'

export function PluginsPage() {
  const { locale } = useAdminLocale()
  const client = useQueryClient()
  const queryKey = ['admin', 'plugins', locale]
  const { data, isLoading } = useQuery<PluginState[]>({
    queryKey,
    queryFn: async () => {
      const res = await api.get<PluginsResponse>('/admin/plugins')
      const list = (res as PluginsResponse)?.data ?? (res as unknown as PluginState[])
      return Array.isArray(list) ? list : []
    },
  })

  const [expanded, setExpanded] = useState<string | null>(null)
  const [aboutOpen, setAboutOpen] = useState<string | null>(null)
  const [catFilter, setCatFilter] = useState<string>('all')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [q, setQ] = useState('')

  const toggle = useMutation({
    mutationFn: ({ name, enabled }: { name: string; enabled: boolean }) =>
      api.post(`/admin/plugins/${name}/toggle`, { enabled }),
    onSuccess: async (_data, vars) => {
      setPluginEnabled(vars.name, vars.enabled)
      try {
        const res = await api.get<PluginsResponse>('/admin/plugins')
        const list = (res as PluginsResponse)?.data ?? (res as unknown as PluginState[])
        if (Array.isArray(list)) setPluginStates(list)
      } catch {
        /* keep optimistic setPluginEnabled */
      }
      void client.invalidateQueries({ queryKey })
      void client.invalidateQueries({ queryKey: ['site'] })
      void client.invalidateQueries({ queryKey: ['content-health'] })
      void client.invalidateQueries({ queryKey: ['dashboard'] })
    },
    onError: (err: unknown) => {
      window.alert(err instanceof Error ? err.message : t.pluginsToggleFail)
    },
  })

  const seedPages = useMutation({
    mutationFn: (name: string) => api.post(`/admin/plugins/${name}/seed-pages`, {}),
    onSuccess: () => void client.invalidateQueries({ queryKey }),
  })

  const groups = useMemo(() => {
    const list = data ?? []
    const byCat = new Map<string, PluginState[]>()
    for (const p of list) {
      const cat = p.category && CATEGORY_ORDER.includes(p.category as typeof CATEGORY_ORDER[number])
        ? p.category
        : 'other'
      const arr = byCat.get(cat) ?? []
      arr.push(p)
      byCat.set(cat, arr)
    }
    const sortLocale = locale === 'en' ? 'en' : 'ru'
    for (const arr of byCat.values()) {
      arr.sort((a, b) => (a.label || a.name).localeCompare(b.label || b.name, sortLocale))
    }
    return CATEGORY_ORDER
      .filter((key) => (byCat.get(key)?.length ?? 0) > 0)
      .map((key) => ({
        key,
        label: byCat.get(key)?.[0]?.category_label || categoryFallback(key),
        plugins: byCat.get(key) ?? [],
      }))
  }, [data, locale])

  const stats = useMemo(() => {
    const list = data ?? []
    const on = list.filter((p) => p.is_enabled).length
    return { total: list.length, on, off: list.length - on }
  }, [data])

  const filteredGroups = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return groups
      .filter((g) => catFilter === 'all' || g.key === catFilter)
      .map((g) => ({
        ...g,
        plugins: g.plugins.filter((p) => {
          if (statusFilter === 'on' && !p.is_enabled) return false
          if (statusFilter === 'off' && p.is_enabled) return false
          if (!needle) return true
          const hay = `${p.label || ''} ${p.name} ${p.description || ''}`.toLowerCase()
          return hay.includes(needle)
        }),
      }))
      .filter((g) => g.plugins.length > 0)
  }, [groups, catFilter, statusFilter, q])

  return (
    <div>
      <AdminPageHero
        title={t.pluginsTitle}
        hint={t.pluginsHint}
        eyebrow={t.pluginsEyebrow}
        accent="teal"
        stats={[
          { label: t.pluginsStatTotal, value: isLoading ? '—' : stats.total },
          { label: t.pluginsStatOn, value: isLoading ? '—' : stats.on, tone: 'text-emerald-300' },
          { label: t.pluginsStatOff, value: isLoading ? '—' : stats.off, tone: 'text-zinc-400' },
        ]}
      />

      {/* Filters */}
      <div className="mb-5 flex flex-col gap-3">
        <div className="relative max-w-md">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600" />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t.pluginsSearch}
            className="w-full rounded-full border border-white/10 bg-zinc-900/80 py-2 pl-9 pr-3 text-sm text-zinc-200 placeholder:text-zinc-600 focus:border-teal-400/30 focus:outline-none"
          />
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          <div className="inline-flex w-fit gap-1 rounded-full border border-white/10 bg-black/30 p-0.5">
            {(
              [
                ['all', t.pluginsFilterAll],
                ['on', t.pluginsFilterOn],
                ['off', t.pluginsFilterOff],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setStatusFilter(key)}
                className={
                  statusFilter === key
                    ? 'rounded-full bg-teal-500/20 px-3 py-1 text-xs text-teal-100'
                    : 'rounded-full px-3 py-1 text-xs text-zinc-500 hover:text-zinc-300'
                }
              >
                {label}
              </button>
            ))}
          </div>
          <div className="hidden h-4 w-px bg-white/10 sm:block" aria-hidden />
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => setCatFilter('all')}
              className={
                catFilter === 'all'
                  ? 'rounded-full border border-teal-400/30 bg-teal-500/10 px-3 py-1 text-xs text-teal-100'
                  : 'rounded-full border border-white/10 px-3 py-1 text-xs text-zinc-500 hover:text-zinc-300'
              }
            >
              {t.pluginsAllCategories}
            </button>
            {groups.map((g) => (
              <button
                key={g.key}
                type="button"
                onClick={() => setCatFilter(g.key)}
                className={
                  catFilter === g.key
                    ? 'rounded-full border border-teal-400/30 bg-teal-500/10 px-3 py-1 text-xs text-teal-100'
                    : 'rounded-full border border-white/10 px-3 py-1 text-xs text-zinc-500 hover:text-zinc-300'
                }
              >
                {g.label}
                <span className="ml-1.5 text-zinc-600">{g.plugins.length}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-44" />)}
        </div>
      ) : filteredGroups.length === 0 ? (
        <GlassPanel className="p-10 text-center text-sm text-zinc-500">
          {data?.length ? t.pluginsEmptyFilter : t.pluginsEmpty}
        </GlassPanel>
      ) : (
        <div className="space-y-8">
          {filteredGroups.map((group) => (
            <section key={group.key}>
              <AdminSectionLabel count={group.plugins.length}>{group.label}</AdminSectionLabel>
              <div className="grid items-start gap-3 sm:grid-cols-2">
                {group.plugins.map((p) => {
                  const wide = expanded === p.name || aboutOpen === p.name
                  return (
                    <div key={p.name} className={wide ? 'sm:col-span-2' : undefined}>
                      <PluginCard
                        plugin={p}
                        categoryKey={group.key}
                        isCore={CORE_PLUGINS.has(p.name)}
                        expanded={expanded === p.name}
                        aboutOpen={aboutOpen === p.name}
                        onExpand={() => {
                          setExpanded((cur) => (cur === p.name ? null : p.name))
                          setAboutOpen((cur) => (cur === p.name ? null : cur))
                        }}
                        onToggleAbout={() => {
                          setAboutOpen((cur) => (cur === p.name ? null : p.name))
                          setExpanded((cur) => (cur === p.name ? null : cur))
                        }}
                        onToggle={(enabled) => toggle.mutate({ name: p.name, enabled })}
                        toggling={toggle.isPending && toggle.variables?.name === p.name}
                        onSeedPages={() => seedPages.mutate(p.name)}
                        seeding={seedPages.isPending && seedPages.variables === p.name}
                        onSaved={() => {
                          void client.invalidateQueries({ queryKey })
                          void client.invalidateQueries({ queryKey: ['site'] })
                        }}
                      />
                    </div>
                  )
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}

function DepChips({
  items,
  missing,
  tone = 'neutral',
  max = 3,
}: {
  items: Array<{ name: string; label: string; is_enabled?: boolean }>
  missing?: Set<string>
  tone?: 'neutral' | 'sky' | 'amber'
  max?: number
}) {
  if (!items.length) return null
  const shown = items.slice(0, max)
  const rest = items.length - shown.length
  return (
    <>
      {shown.map((d) => {
        const off = missing?.has(d.name) || d.is_enabled === false
        const cls = off
          ? 'border-amber-500/35 bg-amber-500/10 text-amber-200'
          : tone === 'sky'
            ? 'border-sky-500/25 bg-sky-500/10 text-sky-200'
            : 'border-white/10 bg-white/[0.04] text-zinc-400'
        return (
          <span key={d.name} title={d.name} className={`rounded-md border px-1.5 py-0.5 text-[11px] ${cls}`}>
            {d.label}
          </span>
        )
      })}
      {rest > 0 ? (
        <span className="rounded-md border border-white/10 bg-white/[0.03] px-1.5 py-0.5 text-[11px] text-zinc-500">
          +{rest}
        </span>
      ) : null}
    </>
  )
}

function PluginCard({
  plugin,
  categoryKey,
  isCore,
  expanded,
  aboutOpen,
  onExpand,
  onToggleAbout,
  onToggle,
  toggling,
  onSeedPages,
  seeding,
  onSaved,
}: {
  plugin: PluginState
  categoryKey: string
  isCore: boolean
  expanded: boolean
  aboutOpen: boolean
  onExpand: () => void
  onToggleAbout: () => void
  onToggle: (enabled: boolean) => void
  toggling: boolean
  onSeedPages: () => void
  seeding: boolean
  onSaved: () => void
}) {
  const { locale } = useAdminLocale()
  void locale
  const hasSettings = (plugin.settings_schema?.length ?? 0) > 0
  const demoPages = plugin.demo_pages ?? []
  const hasDemoPages = demoPages.length > 0
  const short = (plugin.description || '').trim()
  const long = (plugin.long_description || '').trim()
  const requires = plugin.requires_labels ?? []
  const suggests = plugin.suggests_labels ?? []
  const requiredBy = plugin.required_by_labels ?? []
  const missing = new Set(plugin.missing_requires ?? [])
  const hasDepsInfo = requires.length > 0 || suggests.length > 0 || requiredBy.length > 0
  const hasAbout = Boolean(long || short || hasDepsInfo)
  const panelOpen = aboutOpen || expanded
  const canToggle = plugin.is_enabled
    ? (plugin.can_disable !== false && !isCore)
    : (plugin.can_enable !== false)
  const toggleHint = plugin.is_enabled
    ? (plugin.block_disable_reason || (isCore ? 'Ядро нельзя отключить' : undefined))
    : (plugin.block_enable_reason || undefined)

  const glow = CATEGORY_GLOW[categoryKey] || CATEGORY_GLOW.other
  const iconTone = plugin.is_enabled
    ? (CATEGORY_ICON[categoryKey] || CATEGORY_ICON.other)
    : 'border-white/10 bg-black/35 text-zinc-500'

  return (
    <GlassPanel
      // No h-full: grid stretch + overflow-hidden clips «О плагине» / «Настройки».
      className={`relative flex flex-col p-0 transition ${
        panelOpen ? 'overflow-visible' : 'overflow-hidden'
      } ${plugin.is_enabled ? 'ring-1 ring-white/[0.08]' : ''}`}
    >
      <div
        className="pointer-events-none absolute inset-0 rounded-[inherit]"
        style={{ background: glow }}
        aria-hidden
      />
      <div className="relative flex flex-col gap-3 p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <div
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border ${iconTone}`}
          >
            <Puzzle size={17} aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <h3 className="font-heading text-base text-zinc-50">
                {plugin.label || plugin.name}
              </h3>
              {isCore && (
                <span className="rounded-full border border-amber-400/35 bg-amber-500/10 px-2 py-0.5 text-[10px] text-amber-200">
                  {t.pluginsCoreBadge}
                </span>
              )}
            </div>
            <code className="mt-1 inline-block rounded-md border border-white/[0.06] bg-black/40 px-1.5 py-0.5 font-mono text-[11px] text-zinc-500">
              {plugin.name}
            </code>
          </div>
          <button
            type="button"
            disabled={!canToggle || toggling}
            onClick={() => onToggle(!plugin.is_enabled)}
            title={toggleHint}
            className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition ${
              plugin.is_enabled
                ? 'border-emerald-400/40 bg-emerald-500/10 text-emerald-200 hover:bg-emerald-500/20'
                : 'border-white/10 bg-zinc-900/80 text-zinc-400 hover:border-white/20 hover:text-zinc-200'
            } ${!canToggle ? 'cursor-not-allowed opacity-45' : ''}`}
          >
            <Power size={13} aria-hidden />
            {toggling ? '…' : plugin.is_enabled ? t.pluginsOn : t.pluginsOff}
          </button>
        </div>

        <p className="line-clamp-2 text-sm leading-relaxed text-zinc-400">
          {short || (hasSettings ? t.pluginsSettingsCount(plugin.settings_schema.length) : t.pluginsNoSettings)}
          {!short && hasDemoPages ? ` · ${t.pluginsDemoPages(demoPages.length)}` : ''}
        </p>

        {(requires.length > 0 || (requiredBy.length > 0 && plugin.is_enabled)) && (
          <div className="space-y-1.5">
            {requires.length > 0 && (
              <div className="flex flex-wrap items-center gap-1">
                <span className="mr-0.5 text-[10px] uppercase tracking-wide text-zinc-600">{t.pluginsNeeds}</span>
                <DepChips items={requires} missing={missing} max={3} />
              </div>
            )}
            {requiredBy.length > 0 && plugin.is_enabled && (
              <div className="flex flex-wrap items-center gap-1">
                <span className="mr-0.5 text-[10px] uppercase tracking-wide text-zinc-600">{t.pluginsFor}</span>
                <DepChips items={requiredBy} tone="sky" max={3} />
              </div>
            )}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-1.5">
          {hasAbout ? (
            <button
              type="button"
              onClick={onToggleAbout}
              aria-expanded={aboutOpen}
              className={`inline-flex h-8 items-center gap-1 rounded-lg border px-2.5 text-xs transition ${
                aboutOpen
                  ? 'border-teal-400/30 bg-teal-500/10 text-teal-100'
                  : 'border-white/10 text-zinc-400 hover:bg-white/5 hover:text-zinc-200'
              }`}
            >
              <Info size={13} />
              {t.pluginsAbout}
              <ChevronDown size={12} className={`transition ${aboutOpen ? 'rotate-180' : ''}`} />
            </button>
          ) : null}

          {hasSettings && (
            <button
              type="button"
              onClick={onExpand}
              aria-expanded={expanded}
              className={`inline-flex h-8 items-center gap-1 rounded-lg border px-2.5 text-xs transition ${
                expanded
                  ? 'border-teal-400/30 bg-teal-500/10 text-teal-100'
                  : 'border-white/10 text-zinc-400 hover:bg-white/5 hover:text-zinc-200'
              }`}
            >
              <Settings2 size={13} />
              {t.pluginsSettings}
              <ChevronDown size={12} className={`transition ${expanded ? 'rotate-180' : ''}`} />
            </button>
          )}

          {hasDemoPages && (
            <button
              type="button"
              disabled={seeding}
              onClick={onSeedPages}
              title={`${t.pluginsPages}: ${demoPages.map((d) => d.slug).join(', ')}`}
              className="inline-flex h-8 items-center gap-1 rounded-lg border border-white/10 px-2.5 text-xs text-zinc-400 hover:bg-white/5 hover:text-zinc-200 disabled:opacity-50"
            >
              <FilePlus2 size={13} />
              {seeding ? t.pluginsPagesCreating : t.pluginsPages}
            </button>
          )}
        </div>
      </div>

      {aboutOpen && hasAbout && (
        <div className="relative shrink-0 border-t border-white/10 bg-black/40 px-4 py-4 sm:px-5">
          {(long || short) ? (
            <>
              <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-zinc-500">{t.pluginsAbout}</p>
              <div className="space-y-2 text-sm leading-relaxed text-zinc-300 whitespace-pre-line">
                {long || short}
              </div>
            </>
          ) : null}
          {hasDepsInfo && (
            <div className={`${long || short ? 'mt-4 border-t border-white/10 pt-3' : ''} space-y-2 text-sm text-zinc-400`}>
              <p className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">{t.pluginsDeps}</p>
              {requires.length > 0 && (
                <p>
                  <span className="text-zinc-500">{t.pluginsDepsRequired}</span>
                  {requires.map((d) => d.label).join(', ')}
                  <span className="text-zinc-600">{t.pluginsDepsRequiredHint}</span>
                </p>
              )}
              {suggests.length > 0 && (
                <p>
                  <span className="text-zinc-500">{t.pluginsDepsSuggested}</span>
                  {suggests.map((d) => d.label).join(', ')}
                </p>
              )}
              {requiredBy.length > 0 && (
                <p>
                  <span className="text-zinc-500">{t.pluginsDepsRequiredBy}</span>
                  {requiredBy.map((d) => d.label).join(', ')}
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {expanded && hasSettings && (
        <div className="relative shrink-0 border-t border-white/10 bg-black/30 p-4 sm:p-5">
          <PluginSettingsForm plugin={plugin} onSaved={onSaved} />
        </div>
      )}
    </GlassPanel>
  )
}

type SettingsSection = {
  key: string
  label: string
  help?: string
  fields: PluginSettingField[]
  enableKey?: string
}

function splitSettingsSections(schema: PluginSettingField[], defaultLabel: string): SettingsSection[] {
  const sections: SettingsSection[] = []
  let current: SettingsSection | null = null
  for (const field of schema) {
    if (field.type === 'heading') {
      current = { key: field.key, label: field.label, help: field.help, fields: [] }
      sections.push(current)
      continue
    }
    if (!current) {
      current = { key: '_general', label: defaultLabel, fields: [] }
      sections.push(current)
    }
    current.fields.push(field)
    if (!current.enableKey && (field.type === 'checkbox' || field.type === 'toggle') && field.key.startsWith('enable_')) {
      current.enableKey = field.key
    }
  }
  return sections
}

function PluginSettingsForm({ plugin, onSaved }: { plugin: PluginState; onSaved: () => void }) {
  const { locale } = useAdminLocale()
  void locale
  const [values, setValues] = useState<Record<string, unknown>>(() => ({ ...plugin.settings }))
  const [savedMsg, setSavedMsg] = useState('')
  const sections = useMemo(
    () => splitSettingsSections(plugin.settings_schema, t.pluginsSettingsHeading),
    [plugin.settings_schema, locale],
  )
  const useSplit = sections.length >= 2
  const [activeKey, setActiveKey] = useState(() => sections[0]?.key ?? '')

  const active = sections.find((s) => s.key === activeKey) ?? sections[0]

  const save = useMutation({
    mutationFn: (settings: Record<string, unknown>) =>
      api.put(`/admin/plugins/${plugin.name}/settings`, { settings }),
    onSuccess: () => {
      setSavedMsg(t.pluginsSaved)
      onSaved()
      setTimeout(() => setSavedMsg(''), 2000)
    },
  })

  const setField = (key: string, v: unknown) => setValues((prev) => ({ ...prev, [key]: v }))

  const saveBar = (
    <div className="flex flex-wrap items-center gap-3 border-t border-white/10 pt-3">
      <Button type="submit" className="admin-primary" disabled={save.isPending}>
        <Save size={15} className="mr-1.5" />
        {save.isPending ? t.pluginsSaving : t.pluginsSave}
      </Button>
      {savedMsg && <span className="text-sm text-emerald-400">{savedMsg}</span>}
      {save.isError && <span className="text-sm text-red-400">{save.error?.message}</span>}
    </div>
  )

  if (!useSplit) {
    return (
      <form
        onSubmit={(e) => {
          e.preventDefault()
          save.mutate(values)
        }}
        className="grid gap-3 sm:grid-cols-2"
      >
        {plugin.settings_schema.map((field) =>
          field.type === 'heading' ? (
            <div key={field.key} className="sm:col-span-2 mt-1 border-t border-white/10 pt-3 first:mt-0 first:border-t-0 first:pt-0">
              <h3 className="text-sm font-semibold tracking-wide text-zinc-200">{field.label}</h3>
              {field.help && <p className="mt-0.5 text-xs text-zinc-500">{field.help}</p>}
            </div>
          ) : (
            <SettingFieldInput key={field.key} field={field} value={values[field.key]} onChange={(v) => setField(field.key, v)} />
          ),
        )}
        <div className="sm:col-span-2">{saveBar}</div>
      </form>
    )
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        save.mutate(values)
      }}
      className="flex flex-col gap-4 lg:flex-row lg:items-stretch"
    >
      <div className="min-w-0 flex-1 space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold text-zinc-100">{active?.label}</h3>
            {active?.help && <p className="text-xs text-zinc-500">{active.help}</p>}
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {(active?.fields ?? []).map((field) => (
            <SettingFieldInput
              key={field.key}
              field={field}
              value={values[field.key]}
              onChange={(v) => setField(field.key, v)}
              compact
            />
          ))}
        </div>
        {saveBar}
      </div>

      <aside className="w-full shrink-0 lg:w-56 xl:w-64">
        <div className="rounded-xl border border-white/10 bg-black/30 lg:sticky lg:top-4">
          <p className="border-b border-white/10 px-3 py-2 text-[11px] font-medium uppercase tracking-wider text-zinc-500">
            {t.pluginsSections}
          </p>
          <nav className="flex max-h-[min(28rem,60vh)] gap-1 overflow-x-auto overflow-y-auto p-1 lg:flex-col">
            {sections.map((section) => {
              const on = section.enableKey ? Boolean(values[section.enableKey]) : null
              const selected = section.key === (active?.key ?? '')
              return (
                <button
                  key={section.key}
                  type="button"
                  onClick={() => setActiveKey(section.key)}
                  className={`flex shrink-0 items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm transition lg:w-full ${
                    selected
                      ? 'bg-white/10 text-zinc-100'
                      : 'text-zinc-400 hover:bg-white/5 hover:text-zinc-200'
                  }`}
                >
                  <span
                    className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                      on === true ? 'bg-emerald-400' : on === false ? 'bg-zinc-600' : 'bg-zinc-500'
                    }`}
                  />
                  <span className="min-w-0 flex-1 truncate">{section.label}</span>
                </button>
              )
            })}
          </nav>
        </div>
      </aside>
    </form>
  )
}

function SettingFieldInput({
  field,
  value,
  onChange,
  compact = false,
}: {
  field: PluginSettingField
  value: unknown
  onChange: (v: unknown) => void
  compact?: boolean
}) {
  const inputCls = compact
    ? 'w-full rounded-md border border-white/10 bg-[#10141c] px-2.5 py-1.5 text-sm'
    : 'w-full rounded-lg border border-white/10 bg-[#10141c] px-3 py-2 text-sm'

  const labelEl = (
    <label className="mb-1 block text-xs text-zinc-400">
      {field.label}
      {field.help && !compact && <span className="ml-2 text-[11px] text-zinc-600">{field.help}</span>}
    </label>
  )

  const type = field.type
  if (type === 'checkbox' || type === 'toggle') {
    return (
      <div className={compact ? 'sm:col-span-2' : undefined}>
        <label className="flex cursor-pointer items-start gap-2 text-sm text-zinc-300">
          <input
            type="checkbox"
            checked={Boolean(value)}
            onChange={(e) => onChange(e.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0"
          />
          <span>
            {field.label}
            {field.help && <span className="mt-0.5 block text-[11px] text-zinc-600">{field.help}</span>}
          </span>
        </label>
      </div>
    )
  }
  if (type === 'textarea') {
    return (
      <div className="sm:col-span-2">
        {labelEl}
        <textarea
          value={String(value ?? '')}
          onChange={(e) => onChange(e.target.value)}
          rows={compact ? 3 : 4}
          className={inputCls}
        />
        {compact && field.help && <p className="mt-1 text-[11px] text-zinc-600">{field.help}</p>}
      </div>
    )
  }
  if (type === 'select' && field.options) {
    return (
      <div className="min-w-0 sm:col-span-2">
        {labelEl}
        <select
          value={String(value ?? '')}
          onChange={(e) => onChange(e.target.value)}
          className={inputCls}
        >
          {field.options.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        {compact && field.help && <p className="mt-1 text-[11px] text-zinc-600">{field.help}</p>}
      </div>
    )
  }
  if (type === 'number') {
    return (
      <div>
        {labelEl}
        <input
          type="number"
          value={value === undefined || value === null ? '' : Number(value)}
          onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))}
          className={inputCls}
        />
        {compact && field.help && <p className="mt-1 text-[11px] text-zinc-600">{field.help}</p>}
      </div>
    )
  }
  return (
    <div className="min-w-0">
      {labelEl}
      <input
        type={type === 'color' ? 'color' : type === 'date' ? 'date' : type === 'datetime' ? 'datetime-local' : type === 'url' ? 'url' : 'text'}
        value={String(value ?? '')}
        onChange={(e) => onChange(e.target.value)}
        className={inputCls}
      />
      {compact && field.help && <p className="mt-1 text-[11px] text-zinc-600">{field.help}</p>}
    </div>
  )
}
