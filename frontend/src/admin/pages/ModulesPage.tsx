import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  Package,
  RefreshCw,
  ShieldAlert,
  Trash2,
  Upload,
} from 'lucide-react'
import { api } from '@/lib/api'
import { loadPackageModules, unloadPackageModule } from '@/core/packageModuleLoader'
import { Button, GhostButton, GlassPanel, Skeleton } from '@/shared/ui'
import { PageContext } from '@/admin/components/PageContext'
import { adminUrl } from '@/admin/adminBasePath'
import clsx from 'clsx'

type InstalledModule = {
  slug: string
  name: string
  installed_version: string
  status: string
  source: string
  signature_status?: string
  health_status?: string
  last_error?: string | null
  rollback_available?: boolean
  description?: string
  installed_at?: string
  updated_at?: string
}

type HealthReport = {
  slug: string
  status: string
  issues: string[]
  warnings: string[]
}

type InspectPlan = {
  ok: boolean
  errors?: string[]
  warnings?: string[]
  manifest?: Record<string, unknown>
  signature?: { status?: string; message?: string }
  dependency_plan?: {
    ok: boolean
    missing: Array<{ slug: string; constraint: string }>
    conflicts: Array<{ slug: string; constraint: string; installed: string }>
    optional: Array<{ slug: string; constraint: string; installed: string | null }>
  }
  operation?: string
  slug?: string
  from_version?: string | null
  to_version?: string
  package_checksum?: string
}

type Operation = {
  id: number
  module_slug: string
  operation: string
  status: string
  error?: string | null
  started_at?: string
  finished_at?: string
  log_json?: string
}

export function ModulesPage() {
  const [tab, setTab] = useState<'installed' | 'upload' | 'operations'>('installed')
  const [modules, setModules] = useState<InstalledModule[]>([])
  const [ops, setOps] = useState<Operation[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [packageId, setPackageId] = useState<string | null>(null)
  const [plan, setPlan] = useState<InspectPlan | null>(null)
  const [keepData, setKeepData] = useState(true)
  const [contentMode, setContentMode] = useState<'merge' | 'skip' | 'replace'>('merge')
  const [healthReport, setHealthReport] = useState<HealthReport | null>(null)
  const [notice, setNotice] = useState('')

  const refresh = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [list, operations] = await Promise.all([
        api.get<{ data: InstalledModule[] }>('/admin/modules'),
        api.get<{ data: Operation[] }>('/admin/module-operations'),
      ])
      setModules(Array.isArray(list.data) ? list.data : [])
      setOps(Array.isArray(operations.data) ? operations.data : [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось загрузить модули')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key)
    setError('')
    setNotice('')
    try {
      await fn()
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка операции')
    } finally {
      setBusy(null)
    }
  }

  const runHealth = async (slug: string) => {
    setBusy(`health-${slug}`)
    setError('')
    setNotice('')
    setHealthReport(null)
    try {
      const res = await api.post<{
        data: { status?: string; issues?: string[]; warnings?: string[] }
      }>(`/admin/modules/${slug}/health`, {})
      const data = res.data ?? {}
      setHealthReport({
        slug,
        status: String(data.status || 'unknown'),
        issues: Array.isArray(data.issues) ? data.issues : [],
        warnings: Array.isArray(data.warnings) ? data.warnings : [],
      })
      setNotice(`Проверка ${slug}: ${String(data.status || 'unknown')}`)
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка health-check')
    } finally {
      setBusy(null)
    }
  }

  const runRollback = async (slug: string, available: boolean) => {
    if (!available) {
      setError(
        'Откат недоступен: снимок создаётся только при обновлении модуля (update). После первой установки откатывать некуда.',
      )
      return
    }
    const ok = window.confirm(`Откатить модуль ${slug} к предыдущему снимку файлов?`)
    if (!ok) return
    setBusy(`rb-${slug}`)
    setError('')
    setNotice('')
    try {
      await api.post(`/admin/modules/${slug}/rollback`, {})
      setNotice(`Откат ${slug} выполнен`)
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка отката')
    } finally {
      setBusy(null)
    }
  }

  const onUpload = async (file: File | null) => {
    if (!file) return
    setBusy('upload')
    setError('')
    setPlan(null)
    try {
      const form = new FormData()
      form.append('package', file)
      const up = await api.upload<{ data: { package_id: string } }>('/admin/modules/upload', form)
      const id = up.data?.package_id
      if (!id) throw new Error('package_id missing')
      setPackageId(id)
      const inspected = await api.post<{ data: InspectPlan }>('/admin/modules/inspect', { package_id: id })
      setPlan(inspected.data)
      setTab('upload')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка загрузки')
    } finally {
      setBusy(null)
    }
  }

  const confirmInstall = async () => {
    if (!packageId || !plan?.slug) return
    const slug = plan.slug
    const op = plan.operation === 'update' ? 'update' : 'install'
    await run('install', async () => {
      if (op === 'update') {
        await api.post(`/admin/modules/${slug}/update`, { package_id: packageId })
      } else {
        await api.post(`/admin/modules/${slug}/install`, {
          package_id: packageId,
          content_mode: contentMode,
          preserve_existing_data: false,
        })
      }
      setPackageId(null)
      setPlan(null)
      setTab('installed')
    })
  }

  return (
    <>
      <div className="mb-6">
        <h1 className="font-heading text-3xl">Модули</h1>
        <p className="mt-1 text-sm text-zinc-500">Установка и обновление пакетов без пересборки CMS</p>
        <PageContext contextKey="modules" />
      </div>

      <GlassPanel className="mb-5 border-amber-400/30 bg-amber-500/[0.06] p-4 text-sm text-amber-50/90">
        <div className="flex gap-2">
          <ShieldAlert className="mt-0.5 shrink-0" size={18} />
          <div>
            <b>Установка модуля = установка серверного ПО.</b> Используйте пакеты только из доверенных
            источников. ZIP содержит исполняемый PHP-код.
            <div className="mt-2 text-xs text-amber-100/70">
              Включение/настройки bundled-плагинов — в{' '}
              <Link className="underline" to={adminUrl('/plugins')}>
                Плагины
              </Link>
              .
            </div>
          </div>
        </div>
      </GlassPanel>

      <div className="mb-5 flex flex-wrap gap-2">
        {(
          [
            ['installed', 'Установленные'],
            ['upload', 'Загрузить'],
            ['operations', 'Операции'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={clsx(
              'rounded-full border px-3 py-1.5 text-sm transition',
              tab === id
                ? 'border-white/20 bg-white/10 text-white'
                : 'border-white/10 text-zinc-400 hover:border-white/20 hover:text-zinc-200',
            )}
          >
            {label}
          </button>
        ))}
        <GhostButton type="button" className="ml-auto" disabled={!!busy} onClick={() => void refresh()}>
          <RefreshCw size={15} />
          Обновить
        </GhostButton>
      </div>

      {error ? (
        <GlassPanel className="mb-4 border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">{error}</GlassPanel>
      ) : null}
      {notice ? (
        <GlassPanel className="mb-4 border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-100">
          {notice}
        </GlassPanel>
      ) : null}

      {tab === 'installed' && (
        <div className="space-y-3">
          {loading ? (
            <Skeleton className="h-40" />
          ) : modules.length === 0 ? (
            <GlassPanel className="p-10 text-center text-sm text-zinc-500">
              Нет установленных package-модулей. Загрузите ZIP на вкладке «Загрузить».
            </GlassPanel>
          ) : (
            modules.map((m) => (
              <GlassPanel key={m.slug} className="p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Package size={16} className="text-zinc-400" />
                      <b>{m.name}</b>
                      <span className="text-xs text-zinc-500">{m.slug}</span>
                      <span className="rounded-full border border-white/10 px-2 py-0.5 text-[10px] uppercase text-zinc-400">
                        {m.status}
                      </span>
                      <span className="text-xs text-zinc-500">v{m.installed_version}</span>
                    </div>
                    <p className="mt-1 text-xs text-zinc-500">
                      source={m.source} · signature={m.signature_status || '—'} · health=
                      {m.health_status || '—'}
                      {m.rollback_available ? ' · file-rollback=yes' : ' · file-rollback=no'}
                      {' · db-rollback=no'}
                    </p>
                    {m.rollback_available ? (
                      <p className="mt-1 text-[11px] text-amber-200/90">
                        Откат восстанавливает файлы модуля и записи реестра. SQL-миграции пакета
                        обратно не откатываются (db_rollback_available=false).
                      </p>
                    ) : null}
                    {m.last_error ? <p className="mt-2 text-xs text-red-300">{m.last_error}</p> : null}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {m.status !== 'enabled' ? (
                      <Button
                        type="button"
                        disabled={!!busy}
                        onClick={() =>
                          void run(`en-${m.slug}`, async () => {
                            await api.post(`/admin/modules/${m.slug}/enable`, {})
                            await loadPackageModules()
                          })
                        }
                      >
                        Включить
                      </Button>
                    ) : (
                      <GhostButton
                        type="button"
                        disabled={!!busy}
                        onClick={() =>
                          void run(`dis-${m.slug}`, async () => {
                            await api.post(`/admin/modules/${m.slug}/disable`, {})
                            unloadPackageModule(m.slug)
                          })
                        }
                      >
                        Отключить
                      </GhostButton>
                    )}
                    <GhostButton
                      type="button"
                      disabled={!!busy}
                      onClick={() => void runHealth(m.slug)}
                    >
                      <CheckCircle2 size={15} />
                      {busy === `health-${m.slug}` ? 'Проверка…' : 'Проверка'}
                    </GhostButton>
                    <GhostButton
                      type="button"
                      disabled={!!busy}
                      onClick={() =>
                        void run(`compat-${m.slug}`, async () => {
                          const res = await api.get<{
                            data: {
                              score?: number
                              ok?: boolean
                              errors?: string[]
                              warnings?: string[]
                              recommendations?: string[]
                            }
                          }>(`/admin/modules/${m.slug}/compatibility`)
                          const d = res.data ?? {}
                          setHealthReport({
                            slug: m.slug,
                            status: d.ok ? `compat:${d.score ?? 0}` : `compat-fail:${d.score ?? 0}`,
                            issues: Array.isArray(d.errors) ? d.errors : [],
                            warnings: [
                              ...(Array.isArray(d.warnings) ? d.warnings : []),
                              ...(Array.isArray(d.recommendations)
                                ? d.recommendations.map((x) => `→ ${x}`)
                                : []),
                            ],
                          })
                          setNotice(`Compatibility ${m.slug}: score ${d.score ?? '—'}`)
                        })
                      }
                    >
                      Compat
                    </GhostButton>
                    <GhostButton
                      type="button"
                      disabled={!!busy || !m.rollback_available}
                      title={
                        m.rollback_available
                          ? 'Откатить к снимку после последнего update'
                          : 'Нет снимка: rollback только после обновления пакета'
                      }
                      onClick={() => void runRollback(m.slug, !!m.rollback_available)}
                    >
                      <Download size={15} />
                      Откат
                    </GhostButton>
                    <GhostButton
                      type="button"
                      disabled={!!busy}
                      onClick={() => {
                        const remove = window.confirm(
                          keepData
                            ? `Удалить модуль ${m.slug}, сохранив данные?`
                            : `Удалить модуль ${m.slug} И данные? Это необратимо.`,
                        )
                        if (!remove) return
                        void run(`un-${m.slug}`, () =>
                          api
                            .post(`/admin/modules/${m.slug}/uninstall`, { keep_data: keepData })
                            .then(() => undefined),
                        )
                      }}
                    >
                      <Trash2 size={15} />
                      Удалить
                    </GhostButton>
                  </div>
                </div>
                {healthReport?.slug === m.slug ? (
                  <div className="mt-4 rounded-lg border border-white/10 bg-black/25 p-3 text-xs text-zinc-300">
                    <div className="mb-2 font-medium text-zinc-100">
                      Результат проверки: <span className="uppercase">{healthReport.status}</span>
                    </div>
                    {healthReport.issues.length === 0 && healthReport.warnings.length === 0 ? (
                      <p className="text-emerald-200/90">Проблем не найдено.</p>
                    ) : null}
                    {healthReport.issues.length > 0 ? (
                      <ul className="mb-2 list-disc space-y-1 pl-4 text-red-300">
                        {healthReport.issues.map((i) => (
                          <li key={i}>{i}</li>
                        ))}
                      </ul>
                    ) : null}
                    {healthReport.warnings.length > 0 ? (
                      <ul className="list-disc space-y-1 pl-4 text-amber-200/90">
                        {healthReport.warnings.map((w) => (
                          <li key={w}>{w}</li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                ) : null}
              </GlassPanel>
            ))
          )}
          <label className="mt-3 flex items-center gap-2 text-xs text-zinc-500">
            <input type="checkbox" checked={keepData} onChange={(e) => setKeepData(e.target.checked)} />
            При удалении сохранять данные (таблицы / uploads)
          </label>
        </div>
      )}

      {tab === 'upload' && (
        <div className="space-y-4">
          <GlassPanel className="p-6">
            <label className="flex cursor-pointer flex-col items-center gap-3 rounded-xl border border-dashed border-white/15 px-6 py-10 text-center hover:border-white/30">
              <Upload size={22} className="text-zinc-400" />
              <span className="text-sm text-zinc-300">Выберите .zip / .jasefly-module.zip</span>
              <input
                type="file"
                accept=".zip,application/zip"
                className="hidden"
                disabled={!!busy}
                onChange={(e) => void onUpload(e.target.files?.[0] ?? null)}
              />
            </label>
          </GlassPanel>

          {plan ? (
            <GlassPanel className="space-y-3 p-5 text-sm">
              <div className="flex items-center gap-2">
                {plan.ok ? (
                  <CheckCircle2 className="text-emerald-400" size={18} />
                ) : (
                  <AlertTriangle className="text-amber-400" size={18} />
                )}
                <b>
                  {plan.operation === 'update' ? 'Обновление' : 'Установка'}: {String(plan.manifest?.name || plan.slug)}{' '}
                  {plan.to_version}
                </b>
              </div>
              <p className="text-xs text-zinc-500">checksum {plan.package_checksum}</p>
              <p className="text-xs text-zinc-500">
                signature: {plan.signature?.status || 'unsigned'} — {plan.signature?.message || ''}
              </p>
              {plan.errors?.length ? (
                <ul className="list-disc pl-5 text-red-300">
                  {plan.errors.map((e) => (
                    <li key={e}>{e}</li>
                  ))}
                </ul>
              ) : null}
              {plan.warnings?.length ? (
                <ul className="list-disc pl-5 text-amber-200/80">
                  {plan.warnings.map((e) => (
                    <li key={e}>{e}</li>
                  ))}
                </ul>
              ) : null}
              {plan.dependency_plan ? (
                <div className="rounded-lg border border-white/10 bg-black/20 p-3 text-xs text-zinc-400">
                  <div>Required missing: {plan.dependency_plan.missing.length || 'нет'}</div>
                  <div>Conflicts: {plan.dependency_plan.conflicts.length || 'нет'}</div>
                </div>
              ) : null}
              <div className="flex flex-wrap items-center gap-3">
                <label className="text-xs text-zinc-400">
                  Контент:{' '}
                  <select
                    className="rounded border border-white/10 bg-black/30 px-2 py-1"
                    value={contentMode}
                    onChange={(e) => setContentMode(e.target.value as typeof contentMode)}
                  >
                    <option value="merge">модуль + настройки</option>
                    <option value="skip">только модуль</option>
                    <option value="replace">с демо-контентом (replace)</option>
                  </select>
                </label>
                <Button type="button" disabled={!plan.ok || !!busy} onClick={() => void confirmInstall()}>
                  {busy === 'install' ? 'Установка…' : plan.operation === 'update' ? 'Обновить' : 'Установить'}
                </Button>
              </div>
            </GlassPanel>
          ) : null}
        </div>
      )}

      {tab === 'operations' && (
        <div className="space-y-2">
          {ops.length === 0 ? (
            <GlassPanel className="p-8 text-center text-sm text-zinc-500">Журнал операций пуст</GlassPanel>
          ) : (
            ops.map((op) => (
              <GlassPanel key={op.id} className="p-4 text-sm">
                <div className="flex flex-wrap justify-between gap-2">
                  <b>
                    #{op.id} {op.module_slug} · {op.operation}
                  </b>
                  <span className="text-xs text-zinc-500">{op.status}</span>
                </div>
                <p className="mt-1 text-xs text-zinc-500">
                  {op.started_at} → {op.finished_at || '…'}
                </p>
                {op.error ? <p className="mt-2 text-xs text-red-300">{op.error}</p> : null}
              </GlassPanel>
            ))
          )}
        </div>
      )}
    </>
  )
}
