import { useCallback, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Languages, Loader2, Play, RefreshCw } from 'lucide-react'
import { api } from '@/lib/api'
import { Button, GlassPanel, Skeleton } from '@/components/ui'
import { RequirePermission } from '@/admin/components/RequirePermission'
import { adminUrl } from '@/admin/adminBasePath'
import { Link } from 'react-router-dom'

type Status = {
  source_lang: string
  targets: string[]
  corpus_size: number
  cache: { rows: number; by_target: Record<string, number> }
  missing: Record<string, number>
  ready: boolean
  provider: string
  auto_warmup?: boolean
}

type WarmupResult = {
  translated: number
  target: string | null
  remaining_for_target: number
  corpus_size: number
  missing: Record<string, number>
  ready: boolean
  finished: boolean
  cache: { rows: number; by_target: Record<string, number> }
}

function asData<T>(payload: { data?: T } | T): T {
  return (payload && typeof payload === 'object' && 'data' in (payload as object))
    ? (payload as { data: T }).data
    : (payload as T)
}

/**
 * Pre-translate CMS content into the translate_cache so the public widget is instant.
 */
export function TranslatePage() {
  const qc = useQueryClient()
  const [log, setLog] = useState<string[]>([])
  const [running, setRunning] = useState(false)

  const status = useQuery({
    queryKey: ['admin', 'translate', 'status'],
    queryFn: async () => asData<Status>(await api.get('/admin/translate/status')),
  })

  const pushLog = (line: string) => setLog((prev) => [line, ...prev].slice(0, 40))

  const runWarmup = useCallback(async () => {
    setRunning(true)
    pushLog('Старт прогрева…')
    try {
      let guard = 0
      while (guard < 500) {
        guard++
        const res = asData<WarmupResult>(
          await api.post('/admin/translate/warmup', { batch_size: 12 }),
        )
        if (res.translated > 0 && res.target) {
          pushLog(
            `${res.target}: +${res.translated} · осталось ~${res.remaining_for_target} · кэш ${res.cache?.rows ?? '—'}`,
          )
        } else if (res.finished) {
          pushLog('Готово: все фразы в кэше.')
          break
        } else {
          pushLog('Нет новых фраз в этом шаге.')
          break
        }
        if (res.finished || res.ready) break
        // Small pause so MyMemory free tier survives
        await new Promise((r) => setTimeout(r, 200))
      }
      await qc.invalidateQueries({ queryKey: ['admin', 'translate', 'status'] })
    } catch (e) {
      pushLog(e instanceof Error ? e.message : 'Ошибка прогрева')
    } finally {
      setRunning(false)
    }
  }, [qc])

  const refresh = useMutation({
    mutationFn: async () => asData<Status>(await api.get('/admin/translate/status')),
    onSuccess: (data) => {
      qc.setQueryData(['admin', 'translate', 'status'], data)
    },
  })

  return (
    <RequirePermission permission="settings.manage">
      <div className="space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="font-heading text-3xl">Переводчик сайта</h1>
            <p className="mt-1 max-w-2xl text-sm text-zinc-500">
              Пока сайт открыт, он сам понемногу прогревает кэш переводов (автопрогрев). Кнопка ниже — ручной ускоренный прогон.
              Настройки — в{' '}
              <Link to={adminUrl('/plugins')} className="underline hover:text-zinc-300">Плагины → Переводчик</Link>.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              className="border border-white/10 bg-transparent"
              disabled={refresh.isPending || running}
              onClick={() => refresh.mutate()}
            >
              <RefreshCw size={15} className={refresh.isPending ? 'animate-spin' : undefined} />
              Обновить
            </Button>
            <Button type="button" disabled={running} onClick={() => void runWarmup()}>
              {running ? <Loader2 size={15} className="animate-spin" /> : <Play size={15} />}
              {running ? 'Прогрев…' : 'Прогнать контент'}
            </Button>
          </div>
        </div>

        {status.isLoading || !status.data ? (
          <Skeleton className="h-40" />
        ) : (
          <div className="grid gap-3 sm:grid-cols-3">
            <GlassPanel className="p-4">
              <p className="text-xs uppercase tracking-wider text-zinc-500">Фраз на сайте</p>
              <p className="mt-1 text-2xl">{status.data.corpus_size}</p>
              <p className="mt-1 text-xs text-zinc-500">исходный язык: {status.data.source_lang}</p>
            </GlassPanel>
            <GlassPanel className="p-4">
              <p className="text-xs uppercase tracking-wider text-zinc-500">В кэше</p>
              <p className="mt-1 text-2xl">{status.data.cache.rows}</p>
              <p className="mt-1 text-xs text-zinc-500">движок: {status.data.provider}</p>
            </GlassPanel>
            <GlassPanel className="p-4">
              <p className="text-xs uppercase tracking-wider text-zinc-500">Статус</p>
              <p className={`mt-1 text-lg ${status.data.ready ? 'text-emerald-300' : 'text-amber-200'}`}>
                {status.data.ready ? 'Готово к быстрым переводам' : 'Нужен прогрев'}
              </p>
              <p className="mt-1 text-xs text-zinc-500">
                {status.data.auto_warmup !== false
                  ? 'автопрогрев на сайте включён'
                  : 'автопрогрев выключен'}
              </p>
            </GlassPanel>
          </div>
        )}

        {status.data && (
          <GlassPanel className="p-5">
            <div className="mb-3 flex items-center gap-2 text-sm font-medium text-zinc-200">
              <Languages size={16} /> Осталось перевести по языкам
            </div>
            <div className="flex flex-wrap gap-2">
              {status.data.targets.map((code) => {
                const miss = status.data!.missing[code] ?? 0
                return (
                  <span
                    key={code}
                    className={`rounded-lg border px-3 py-1.5 text-sm ${
                      miss === 0
                        ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
                        : 'border-white/10 bg-white/5 text-zinc-300'
                    }`}
                  >
                    {code}: {miss === 0 ? 'готово' : `ещё ${miss}`}
                  </span>
                )
              })}
            </div>
            <p className="mt-4 text-xs text-zinc-500">
              Автопрогрев крутится в фоне на публичном сайте (пока открыта вкладка). Ручная кнопка ускоряет прогон в админке.
              После смены текстов сайта кэш догонит сам или через «Прогнать контент».
            </p>
          </GlassPanel>
        )}

        {!!log.length && (
          <GlassPanel className="max-h-64 overflow-y-auto p-4 font-mono text-xs text-zinc-400">
            {log.map((line, i) => (
              <div key={`${i}-${line.slice(0, 12)}`}>{line}</div>
            ))}
          </GlassPanel>
        )}
      </div>
    </RequirePermission>
  )
}
