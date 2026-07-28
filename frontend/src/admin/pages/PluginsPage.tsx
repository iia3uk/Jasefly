import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronDown, Save, Power, Puzzle, FilePlus2, Info } from 'lucide-react'
import { api } from '@/lib/api'
import { Button, GlassPanel, Skeleton } from '@/components/ui'
import { setPluginEnabled, setPluginStates, type PluginState, type PluginSettingField } from '@/core/moduleRegistry'

/** Core plugins that cannot be disabled (mirrors backend guard). */
const CORE_PLUGINS = new Set(['system', 'users'])

const CATEGORY_ORDER = ['core', 'content', 'commerce', 'comms', 'security', 'integrations', 'other'] as const

const CATEGORY_FALLBACK: Record<string, string> = {
  core: 'Ядро',
  content: 'Контент',
  commerce: 'Коммерция',
  comms: 'Коммуникации',
  security: 'Безопасность',
  integrations: 'Интеграции',
  other: 'Прочее',
}

type PluginsResponse = { data: PluginState[] }

export function PluginsPage() {
  const client = useQueryClient()
  const queryKey = ['admin', 'plugins']
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

  const toggle = useMutation({
    mutationFn: ({ name, enabled }: { name: string; enabled: boolean }) =>
      api.post(`/admin/plugins/${name}/toggle`, { enabled }),
    onSuccess: async (_data, vars) => {
      setPluginEnabled(vars.name, vars.enabled)
      // Re-sync full enable map (deps / suggests) so admin API gates match routes.
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
      window.alert(err instanceof Error ? err.message : 'Не удалось переключить плагин')
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
    for (const arr of byCat.values()) {
      arr.sort((a, b) => (a.label || a.name).localeCompare(b.label || b.name, 'ru'))
    }
    return CATEGORY_ORDER
      .filter((key) => (byCat.get(key)?.length ?? 0) > 0)
      .map((key) => ({
        key,
        label: byCat.get(key)?.[0]?.category_label || CATEGORY_FALLBACK[key] || key,
        plugins: byCat.get(key) ?? [],
      }))
  }, [data])

  return (
    <div>
      <div className="mb-6 sm:mb-8">
        <h1 className="font-heading text-2xl sm:text-3xl">Плагины</h1>
        <p className="mt-1 max-w-2xl text-sm text-zinc-500">
          Модули CMS по категориям. При включении подтягиваются обязательные зависимости;
          отключить плагин нельзя, пока от него зависят другие включённые.
        </p>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-24" />)}
        </div>
      ) : groups.length === 0 ? (
        <GlassPanel className="p-8 text-center text-zinc-500">Плагины не обнаружены</GlassPanel>
      ) : (
        <div className="space-y-8">
          {groups.map((group) => (
            <section key={group.key}>
              <h2 className="mb-3 flex items-baseline gap-2 border-b border-white/10 pb-2 font-heading text-sm font-semibold uppercase tracking-[0.14em] text-zinc-400">
                {group.label}
                <span className="text-[11px] font-normal normal-case tracking-normal text-zinc-600">
                  {group.plugins.length}
                </span>
              </h2>
              <div className="space-y-3">
                {group.plugins.map((p) => (
                  <PluginCard
                    key={p.name}
                    plugin={p}
                    isCore={CORE_PLUGINS.has(p.name)}
                    expanded={expanded === p.name}
                    aboutOpen={aboutOpen === p.name}
                    onExpand={() => setExpanded((cur) => (cur === p.name ? null : p.name))}
                    onToggleAbout={() => setAboutOpen((cur) => (cur === p.name ? null : p.name))}
                    onToggle={(enabled) => toggle.mutate({ name: p.name, enabled })}
                    toggling={toggle.isPending && toggle.variables?.name === p.name}
                    onSeedPages={() => seedPages.mutate(p.name)}
                    seeding={seedPages.isPending && seedPages.variables === p.name}
                    onSaved={() => {
                      void client.invalidateQueries({ queryKey })
                      void client.invalidateQueries({ queryKey: ['site'] })
                    }}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}

function PluginCard({
  plugin,
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
  const canToggle = plugin.is_enabled
    ? (plugin.can_disable !== false && !isCore)
    : (plugin.can_enable !== false)
  const toggleHint = plugin.is_enabled
    ? (plugin.block_disable_reason || (isCore ? 'Ядро нельзя отключить' : undefined))
    : (plugin.block_enable_reason || undefined)

  return (
    <GlassPanel className="overflow-hidden p-0">
      <div className="flex flex-col gap-3 p-3 sm:p-4">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/5">
            <Puzzle size={18} className="text-zinc-300" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-heading text-base sm:text-lg">{plugin.label || plugin.name}</h3>
              <code className="rounded bg-white/5 px-1.5 py-0.5 text-[11px] text-zinc-400">{plugin.name}</code>
              {isCore && (
                <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[11px] text-amber-300">
                  ядро
                </span>
              )}
              <span
                className={`rounded-full border px-2 py-0.5 text-[11px] ${
                  plugin.is_enabled
                    ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                    : 'border-white/10 bg-white/5 text-zinc-500'
                }`}
              >
                {plugin.is_enabled ? 'вкл.' : 'выкл.'}
              </span>
            </div>
            {short ? (
              <p className="mt-1 text-sm leading-snug text-zinc-400">{short}</p>
            ) : (
              <p className="mt-1 text-sm text-zinc-600">
                {hasSettings ? `${plugin.settings_schema.length} настроек` : 'без настроек'}
                {hasDemoPages ? ` · ${demoPages.length} стр.` : ''}
              </p>
            )}
            {requires.length > 0 && (
              <p className="mt-2 flex flex-wrap items-center gap-1.5 text-[12px] text-zinc-500">
                <span className="shrink-0 text-zinc-600">Нужны:</span>
                {requires.map((d) => {
                  const off = missing.has(d.name) || d.is_enabled === false
                  return (
                    <span
                      key={d.name}
                      title={off ? 'Сейчас выключен — включится вместе с плагином' : 'Включён'}
                      className={`rounded border px-1.5 py-0.5 ${
                        off
                          ? 'border-amber-500/35 bg-amber-500/10 text-amber-200'
                          : 'border-white/10 bg-white/5 text-zinc-400'
                      }`}
                    >
                      {d.label}
                    </span>
                  )
                })}
              </p>
            )}
            {requiredBy.length > 0 && plugin.is_enabled && (
              <p className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[12px] text-zinc-500">
                <span className="shrink-0 text-zinc-600">Нужен для:</span>
                {requiredBy.map((d) => (
                  <span
                    key={d.name}
                    className="rounded border border-sky-500/30 bg-sky-500/10 px-1.5 py-0.5 text-sky-200"
                  >
                    {d.label}
                  </span>
                ))}
              </p>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {(long || hasDepsInfo) ? (
            <button
              type="button"
              onClick={onToggleAbout}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-white/10 px-2.5 text-sm text-zinc-300 hover:bg-white/5 sm:px-3"
            >
              <Info size={15} />
              <span>О плагине</span>
              <ChevronDown size={14} className={`transition ${aboutOpen ? 'rotate-180' : ''}`} />
            </button>
          ) : null}

          {hasSettings && (
            <button
              type="button"
              onClick={onExpand}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-white/10 px-2.5 text-sm text-zinc-300 hover:bg-white/5 sm:px-3"
            >
              <ChevronDown size={15} className={`transition ${expanded ? 'rotate-180' : ''}`} />
              Настройки
            </button>
          )}

          {hasDemoPages && (
            <button
              type="button"
              disabled={seeding}
              onClick={onSeedPages}
              title={`Страницы: ${demoPages.map((d) => d.slug).join(', ')}`}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-white/10 px-2.5 text-sm text-zinc-300 hover:bg-white/5 disabled:opacity-50 sm:px-3"
            >
              <FilePlus2 size={15} />
              <span className="hidden sm:inline">{seeding ? 'Создание…' : 'Страницы'}</span>
            </button>
          )}

          <button
            type="button"
            disabled={!canToggle || toggling}
            onClick={() => onToggle(!plugin.is_enabled)}
            title={toggleHint}
            className={`ml-auto inline-flex h-9 items-center gap-1.5 rounded-lg border px-2.5 text-sm transition sm:px-3 ${
              plugin.is_enabled
                ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20'
                : 'border-white/10 bg-white/5 text-zinc-400 hover:bg-white/10'
            } ${!canToggle ? 'cursor-not-allowed opacity-50' : ''}`}
          >
            <Power size={15} />
            <span className="hidden sm:inline">{plugin.is_enabled ? 'Включён' : 'Отключён'}</span>
          </button>
        </div>
      </div>

      {aboutOpen && (long || hasDepsInfo) && (
        <div className="border-t border-white/10 bg-black/25 px-3 py-3 sm:px-4 sm:py-4">
          {long ? (
            <>
              <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-zinc-500">О плагине</p>
              <div className="space-y-2 text-sm leading-relaxed text-zinc-300 whitespace-pre-line">
                {long}
              </div>
            </>
          ) : null}
          {hasDepsInfo && (
            <div className={`${long ? 'mt-4 border-t border-white/10 pt-3' : ''} space-y-2 text-sm text-zinc-400`}>
              <p className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">Зависимости</p>
              {requires.length > 0 && (
                <p>
                  <span className="text-zinc-500">Обязательные: </span>
                  {requires.map((d) => d.label).join(', ')}
                  <span className="text-zinc-600"> — без них плагин не работает; при включении подтянутся сами.</span>
                </p>
              )}
              {suggests.length > 0 && (
                <p>
                  <span className="text-zinc-500">Рекомендуемые: </span>
                  {suggests.map((d) => d.label).join(', ')}
                </p>
              )}
              {requiredBy.length > 0 && (
                <p>
                  <span className="text-zinc-500">Нужен для: </span>
                  {requiredBy.map((d) => d.label).join(', ')}
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {expanded && hasSettings && (
        <div className="border-t border-white/10 bg-black/20 p-3 sm:p-4">
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

function splitSettingsSections(schema: PluginSettingField[]): SettingsSection[] {
  const sections: SettingsSection[] = []
  let current: SettingsSection | null = null
  for (const field of schema) {
    if (field.type === 'heading') {
      current = { key: field.key, label: field.label, help: field.help, fields: [] }
      sections.push(current)
      continue
    }
    if (!current) {
      current = { key: '_general', label: 'Настройки', fields: [] }
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
  const [values, setValues] = useState<Record<string, unknown>>(() => ({ ...plugin.settings }))
  const [savedMsg, setSavedMsg] = useState('')
  const sections = useMemo(() => splitSettingsSections(plugin.settings_schema), [plugin.settings_schema])
  const useSplit = sections.length >= 2
  const [activeKey, setActiveKey] = useState(() => sections[0]?.key ?? '')

  const active = sections.find((s) => s.key === activeKey) ?? sections[0]

  const save = useMutation({
    mutationFn: (settings: Record<string, unknown>) =>
      api.put(`/admin/plugins/${plugin.name}/settings`, { settings }),
    onSuccess: () => {
      setSavedMsg('Сохранено')
      onSaved()
      setTimeout(() => setSavedMsg(''), 2000)
    },
  })

  const setField = (key: string, v: unknown) => setValues((prev) => ({ ...prev, [key]: v }))

  const saveBar = (
    <div className="flex flex-wrap items-center gap-3 border-t border-white/10 pt-3">
      <Button type="submit" className="admin-primary" disabled={save.isPending}>
        <Save size={15} className="mr-1.5" />
        {save.isPending ? 'Сохранение…' : 'Сохранить'}
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
        <div className="rounded-lg border border-white/10 bg-black/30 lg:sticky lg:top-4">
          <p className="border-b border-white/10 px-3 py-2 text-[11px] font-medium uppercase tracking-wider text-zinc-500">
            Разделы
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
