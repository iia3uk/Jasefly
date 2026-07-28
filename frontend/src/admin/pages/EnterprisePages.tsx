import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Bot, Check, Copy, RotateCcw, Trash2 } from 'lucide-react'
import { endpoints } from '@/lib/api'
import { Button, GlassPanel, Skeleton } from '@/components/ui'
import { PageContext } from '@/admin/components/PageContext'
import { t, resources, fieldLabel } from '@/admin/i18n'
import { formatMoscowDateTime } from '@/admin/lib/formatDateTime'

const MCP_CURSOR_SNIPPET = `{
  "mcpServers": {
    "jasefly-cms": {
      "command": "node",
      "args": ["C:/JASEFLY_CMS/mcp-cms/src/index.js"],
      "env": { "CMS_REPO_ROOT": "C:/JASEFLY_CMS" }
    }
  }
}`

export function TrashPage() {
  const client = useQueryClient()
  const { data, isLoading } = useQuery({ queryKey: ['trash'], queryFn: endpoints.trash })
  const [confirm, setConfirm] = useState<string | null>(null)

  const restore = useMutation({
    mutationFn: ({ resource, id }: { resource: string; id: number }) => endpoints.restoreTrash(resource, id),
    onSuccess: () => void client.invalidateQueries({ queryKey: ['trash'] }),
  })

  const forceDelete = useMutation({
    mutationFn: ({ resource, id }: { resource: string; id: number }) => endpoints.forceDeleteTrash(resource, id),
    onSuccess: () => void client.invalidateQueries({ queryKey: ['trash'] }),
  })

  const emptyResource = useMutation({
    mutationFn: (resource: string) => endpoints.emptyTrash(resource),
    onSuccess: () => void client.invalidateQueries({ queryKey: ['trash'] }),
  })

  const emptyAll = useMutation({
    mutationFn: () => endpoints.emptyAllTrash(),
    onSuccess: () => void client.invalidateQueries({ queryKey: ['trash'] }),
  })

  const groups = data ?? {}

  return (
    <div>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-heading text-3xl">{t.trash}</h1>
          <p className="mt-1 text-sm text-zinc-500">{t.trashHint}</p>
        </div>
        <Button
          type="button"
          className="button-ghost border border-red-500/30 text-red-300"
          onClick={() => {
            if (confirm === 'all' || window.confirm(t.emptyAllConfirm)) {
              emptyAll.mutate()
              setConfirm(null)
            } else {
              setConfirm('all')
            }
          }}
        >
          {t.emptyAllTrash}
        </Button>
      </div>

      <PageContext contextKey="trash" className="mb-6" />

      {isLoading ? <Skeleton className="h-64" /> : (
        Object.keys(groups).length === 0 ? (
          <GlassPanel className="p-10 text-center text-zinc-500">{t.trashEmpty}</GlassPanel>
        ) : (
          Object.entries(groups).map(([resource, items]) => (
            <section key={resource} className="mb-8">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="font-heading text-xl">{resources[resource] ?? resource}</h2>
                <Button
                  type="button"
                  className="text-xs"
                  onClick={() => {
                    if (window.confirm(t.emptySectionConfirm(resources[resource] ?? resource))) {
                      emptyResource.mutate(resource)
                    }
                  }}
                >
                  {t.emptySection}
                </Button>
              </div>
              <GlassPanel className="divide-y divide-white/10">
                {(items as Array<Record<string, unknown>>).map((item) => (
                  <div key={String(item.id)} className="flex items-center justify-between gap-4 p-4">
                    <div>
                      <p className="font-medium">{String(item.title ?? item.name ?? item.original_name ?? item.id)}</p>
                      <p className="text-xs text-zinc-500">{t.deletedAt}: {String(item.deleted_at ?? '')}</p>
                    </div>
                    <div className="flex gap-2">
                      <Button type="button" className="px-2" onClick={() => restore.mutate({ resource, id: Number(item.id) })}>
                        <RotateCcw size={16} />
                      </Button>
                      <Button
                        type="button"
                        className="px-2 text-red-300"
                        onClick={() => {
                          if (window.confirm(t.permanentDelete)) {
                            forceDelete.mutate({ resource, id: Number(item.id) })
                          }
                        }}
                      >
                        <Trash2 size={16} />
                      </Button>
                    </div>
                  </div>
                ))}
              </GlassPanel>
            </section>
          ))
        )
      )}
    </div>
  )
}

export function ActivityPage() {
  const [params, setParams] = useSearchParams()
  const sourceParam = params.get('source')
  const initialTab = sourceParam === 'mcp' || sourceParam === 'admin' ? sourceParam : 'all'
  const [tab, setTab] = useState<'all' | 'admin' | 'mcp'>(initialTab)
  const { data = [], isLoading } = useQuery({
    queryKey: ['activity', tab],
    queryFn: () => endpoints.activity({ source: tab, limit: 150 }),
  })

  useEffect(() => {
    const next = sourceParam === 'mcp' || sourceParam === 'admin' ? sourceParam : 'all'
    setTab(next)
  }, [sourceParam])

  const tabs: Array<{ id: typeof tab; label: string }> = [
    { id: 'all', label: t.activityTabAll },
    { id: 'admin', label: t.activityTabAdmin },
    { id: 'mcp', label: t.activityTabMcp },
  ]

  const selectTab = (next: typeof tab) => {
    setTab(next)
    setParams((prev) => {
      const nextParams = new URLSearchParams(prev)
      if (next === 'all') nextParams.delete('source')
      else nextParams.set('source', next)
      return nextParams
    }, { replace: true })
  }

  return (
    <div>
      <h1 className="font-heading text-3xl">{t.activityLog}</h1>
      <p className="mt-1 text-sm text-zinc-500">
        {tab === 'mcp' ? t.activityMcpHint : t.activityHint}
      </p>
      <PageContext contextKey="activity" className="mt-4 mb-4" />

      <div className="mb-4 flex flex-wrap gap-2">
        {tabs.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => selectTab(item.id)}
            className={`rounded-lg border px-3 py-1.5 text-sm transition ${
              tab === item.id
                ? 'border-white/25 bg-white/10 text-white'
                : 'border-white/10 text-zinc-400 hover:bg-white/5 hover:text-zinc-200'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      <GlassPanel className="divide-y divide-white/10">
        {isLoading ? (
          <Skeleton className="h-64" />
        ) : data.length === 0 ? (
          <p className="p-8 text-center text-sm text-zinc-500">{t.activityEmpty}</p>
        ) : (
          data.map((row) => {
            const meta = parseActivityMeta(row.metadata)
            const actionLabel = activityActionLabel(row.action)
            const isMcp = row.source === 'mcp' || row.user_name === 'MCP Agent' || meta?.source === 'mcp'
            const changes = Array.isArray(meta?.changes) ? meta.changes.map(String) : []
            return (
              <div key={row.id} className="flex flex-col gap-2 p-4 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <span className="font-medium">{actionLabel}</span>
                    {row.entity_label && <span className="text-zinc-400"> · {row.entity_label}</span>}
                    {row.entity_type && (
                      <span className="ml-2 rounded bg-white/5 px-2 py-0.5 text-xs text-zinc-500">{row.entity_type}</span>
                    )}
                    {isMcp && (
                      <span className="ml-2 rounded border border-cyan-400/30 bg-cyan-500/10 px-2 py-0.5 text-[10px] uppercase tracking-wide text-cyan-200">
                        MCP
                      </span>
                    )}
                  </div>
                  <div className="shrink-0 text-zinc-500">
                    {row.user_name ?? t.system} · {formatMoscowDateTime(String(row.created_at ?? ''))}
                  </div>
                </div>
                {row.action === 'mcp_changelog' && changes.length > 0 && (
                  <ul className="list-inside list-disc text-xs text-zinc-400">
                    {changes.slice(0, 12).map((c, i) => (
                      <li key={`${row.id}-${i}`}>{c}</li>
                    ))}
                  </ul>
                )}
                {row.action === 'mcp_changelog' && typeof meta?.body === 'string' && meta.body && (
                  <p className="whitespace-pre-wrap text-xs text-zinc-500">{meta.body}</p>
                )}
                {row.action === 'system.update' && meta?.package ? (
                  <p className="text-xs text-zinc-500">Пакет: {String(meta.package)} · файлов: {String(meta.files_copied ?? '—')}</p>
                ) : null}
              </div>
            )
          })
        )}
      </GlassPanel>
    </div>
  )
}

function parseActivityMeta(raw: unknown): Record<string, unknown> | null {
  if (!raw) return null
  if (typeof raw === 'object') return raw as Record<string, unknown>
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw) as Record<string, unknown>
    } catch {
      return null
    }
  }
  return null
}

function activityActionLabel(action: string): string {
  const map: Record<string, string> = {
    create: 'Создание',
    update: 'Изменение',
    delete: 'Удаление',
    force_delete: 'Удаление навсегда',
    restore: 'Восстановление',
    publish: 'Публикация',
    login: 'Вход',
    logout: 'Выход',
    settings_change: 'Настройки',
    password_change: 'Смена пароля',
    empty_trash: 'Очистка корзины',
    content_pack_apply: 'Content pack',
    'content_pack.apply': 'Content pack',
    'system.update': 'Деплой CMS',
    mcp_changelog: 'Changelog MCP',
    webhook: 'Webhook',
  }
  return map[action] ?? action.replace(/[._]/g, ' ')
}

type SystemTab = 'health' | 'mcp'

type McpStatus = {
  configured?: boolean
  token_hint?: string
  auth_header?: string
  docs_hint?: string
}

export function SystemStatusPage() {
  const [tab, setTab] = useState<SystemTab>('health')
  const [copied, setCopied] = useState<string | null>(null)
  const { data, isLoading } = useQuery({ queryKey: ['system-status'], queryFn: endpoints.systemStatus })
  const mcpActivity = useQuery({
    queryKey: ['activity', 'mcp', 8],
    queryFn: () => endpoints.activity({ source: 'mcp', limit: 8 }),
    enabled: tab === 'mcp',
  })

  const mcp = (data?.mcp && typeof data.mcp === 'object' ? data.mcp : null) as McpStatus | null
  const loadFailures = Array.isArray(data?.module_load_failures)
    ? (data.module_load_failures as Array<{ module?: string; stage?: string; error?: string }>)
    : []
  const safeMode = data?.module_safe_mode && typeof data.module_safe_mode === 'object' && !Array.isArray(data.module_safe_mode)
    ? (data.module_safe_mode as Record<string, { error?: string; at?: string }>)
    : {}
  const safeModeEntries = Object.entries(safeMode)
  const healthRows = useMemo(() => {
    if (!data) return []
    return Object.entries(data).filter(([key, value]) =>
      key !== 'mcp'
      && key !== 'module_load_failures'
      && key !== 'module_safe_mode'
      && (typeof value !== 'object' || value === null),
    )
  }, [data])

  const copyText = async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(key)
      window.setTimeout(() => setCopied((cur) => (cur === key ? null : cur)), 1600)
    } catch {
      window.alert('Не удалось скопировать')
    }
  }

  const tabs: Array<{ id: SystemTab; label: string }> = [
    { id: 'health', label: t.systemTabHealth },
    { id: 'mcp', label: t.systemTabMcp },
  ]

  return (
    <div>
      <h1 className="font-heading text-3xl">{t.systemStatus}</h1>
      <p className="mt-1 text-sm text-zinc-500">{t.systemHint}</p>
      <PageContext contextKey="system" className="mt-4 mb-4" />

      <div className="mb-6 flex flex-wrap gap-2">
        {tabs.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            className={`rounded-lg border px-3 py-1.5 text-sm transition ${
              tab === item.id
                ? 'border-white/25 bg-white/10 text-white'
                : 'border-white/10 text-zinc-400 hover:bg-white/5 hover:text-zinc-200'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === 'health' ? (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {isLoading
              ? Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-24" />)
              : healthRows.map(([key, value]) => (
                <GlassPanel key={key} className="p-5">
                  <p className="text-xs uppercase tracking-wider text-zinc-500">{fieldLabel(key)}</p>
                  <p className="mt-2 font-heading text-xl">{String(value)}</p>
                </GlassPanel>
              ))}
          </div>

          {!isLoading && (loadFailures.length > 0 || safeModeEntries.length > 0) ? (
            <GlassPanel className="space-y-4 border-amber-500/25 p-5">
              <div>
                <h2 className="font-heading text-lg text-amber-100">Диагностика модулей</h2>
                <p className="mt-1 text-sm text-zinc-500">
                  Ошибки загрузки bundled-модулей и пакетные модули в safe-mode.
                </p>
              </div>
              {loadFailures.length > 0 ? (
                <div>
                  <p className="text-xs uppercase tracking-wider text-zinc-500">Сбои загрузки</p>
                  <ul className="mt-2 space-y-2 text-sm text-zinc-300">
                    {loadFailures.map((row, i) => (
                      <li key={`${row.module}-${row.stage}-${i}`} className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2">
                        <span className="font-medium text-white">{row.module ?? '?'}</span>
                        <span className="text-zinc-500"> · {row.stage ?? '?'}</span>
                        <p className="mt-1 font-mono text-xs text-amber-100/90">{row.error ?? ''}</p>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {safeModeEntries.length > 0 ? (
                <div>
                  <p className="text-xs uppercase tracking-wider text-zinc-500">Safe-mode пакеты</p>
                  <ul className="mt-2 space-y-2 text-sm text-zinc-300">
                    {safeModeEntries.map(([slug, entry]) => (
                      <li key={slug} className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2">
                        <span className="font-medium text-white">{slug}</span>
                        {entry.at ? <span className="text-zinc-500"> · {entry.at}</span> : null}
                        <p className="mt-1 font-mono text-xs text-amber-100/90">{entry.error ?? ''}</p>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </GlassPanel>
          ) : null}
        </div>
      ) : (
        <div className="space-y-4">
          <GlassPanel className="p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="font-heading text-lg">{t.mcpPanelTitle}</h2>
                <p className="mt-1 text-sm text-zinc-500">{t.mcpPanelHint}</p>
              </div>
              <Bot size={18} className="shrink-0 text-cyan-300/80" aria-hidden />
            </div>

            {isLoading ? (
              <Skeleton className="mt-4 h-20" />
            ) : (
              <div className="mt-4 space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`rounded-lg border px-2.5 py-1 text-xs font-medium ${
                      mcp?.configured
                        ? 'border-emerald-400/30 bg-emerald-500/10 text-emerald-200'
                        : 'border-amber-400/30 bg-amber-500/10 text-amber-100'
                    }`}
                  >
                    {mcp?.configured ? t.mcpTokenConfigured : t.mcpTokenMissing}
                  </span>
                  {mcp?.configured && mcp.token_hint ? (
                    <span className="font-mono text-sm text-zinc-400">
                      {t.mcpTokenHint}: {mcp.token_hint}
                    </span>
                  ) : null}
                </div>
                {mcp?.docs_hint ? <p className="text-sm text-zinc-400">{mcp.docs_hint}</p> : null}
                {mcp?.auth_header ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <code className="rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1.5 text-xs text-zinc-300">
                      {mcp.auth_header}
                    </code>
                    <Button type="button" className="px-2 text-xs" onClick={() => void copyText('auth', mcp.auth_header!)}>
                      {copied === 'auth' ? <Check size={14} /> : <Copy size={14} />}
                      <span className="ml-1">{copied === 'auth' ? t.mcpCopied : t.mcpCopy}</span>
                    </Button>
                  </div>
                ) : null}
              </div>
            )}
          </GlassPanel>

          <GlassPanel className="p-5">
            <h3 className="font-heading text-base">{t.mcpSetupTitle}</h3>
            <ol className="mt-3 list-inside list-decimal space-y-2 text-sm text-zinc-400">
              <li>{t.mcpSetupStep1}</li>
              <li>{t.mcpSetupStep2}</li>
              <li>{t.mcpSetupStep3}</li>
            </ol>
            <div className="mt-4 flex items-center justify-between gap-2">
              <p className="text-xs uppercase tracking-wider text-zinc-500">{t.mcpCursorSnippet}</p>
              <Button type="button" className="px-2 text-xs" onClick={() => void copyText('snippet', MCP_CURSOR_SNIPPET)}>
                {copied === 'snippet' ? <Check size={14} /> : <Copy size={14} />}
                <span className="ml-1">{copied === 'snippet' ? t.mcpCopied : t.mcpCopy}</span>
              </Button>
            </div>
            <pre className="mt-2 overflow-x-auto rounded-xl border border-white/10 bg-black/30 p-3 text-xs text-zinc-300">
              {MCP_CURSOR_SNIPPET}
            </pre>
          </GlassPanel>

          <GlassPanel className="p-5">
            <div className="flex items-start justify-between gap-2">
              <h3 className="font-heading text-base">{t.mcpRecentActivity}</h3>
              <Link
                to="/admin/activity?source=mcp"
                className="text-xs text-cyan-200/90 underline-offset-2 hover:underline"
              >
                {t.mcpOpenActivity}
              </Link>
            </div>
            <div className="mt-4 space-y-2">
              {mcpActivity.isLoading ? (
                <Skeleton className="h-28" />
              ) : mcpActivity.data?.length ? (
                mcpActivity.data.map((row) => (
                  <div key={String(row.id)} className="rounded-lg border border-white/5 px-3 py-2">
                    <div className="flex items-start justify-between gap-2">
                      <p className="min-w-0 text-sm text-zinc-300">
                        <span className="mr-2 rounded border border-cyan-400/30 bg-cyan-500/10 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-cyan-200">
                          MCP
                        </span>
                        {activityActionLabel(String(row.action))}
                        {row.entity_type ? <span className="text-zinc-500"> · {String(row.entity_type)}</span> : null}
                        {row.entity_label ? <span className="text-zinc-400"> — {String(row.entity_label)}</span> : null}
                      </p>
                      <span className="shrink-0 text-[11px] text-zinc-600">
                        {formatMoscowDateTime(String(row.created_at ?? ''))}
                      </span>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-sm text-zinc-500">{t.mcpStripEmpty}</p>
              )}
            </div>
          </GlassPanel>
        </div>
      )}
    </div>
  )
}
