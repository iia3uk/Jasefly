import { useCallback, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Eraser, Languages, Loader2, Play, RefreshCw } from 'lucide-react'
import { api } from '@/lib/api'
import { AdminPageHero } from '@/admin/components/AdminPageHero'
import { Button, GlassPanel, Skeleton } from '@/components/ui'
import { RequirePermission } from '@/admin/components/RequirePermission'
import { adminUrl } from '@/admin/adminBasePath'
import { Link } from 'react-router-dom'
import { usePluginEnabled } from '@/hooks/useApi'

type Status = {
  source_lang: string
  targets: string[]
  corpus_size: number
  cache: { rows: number; by_target: Record<string, number> }
  missing: Record<string, number>
  ready: boolean
  provider: string
  auto_warmup?: boolean
  sync_on_save?: boolean
  invalid_hint?: string
}

type WarmupResult = {
  translated: number
  failed?: number
  quota_hit?: boolean
  provider_hint?: string | null
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
 * Pre-translate CMS content into translate_cache so the public widget is instant.
 */
export function TranslatePage() {
  const qc = useQueryClient()
  const pluginOn = usePluginEnabled('translate')
  const [log, setLog] = useState<string[]>([])
  const [running, setRunning] = useState(false)

  const status = useQuery({
    queryKey: ['admin', 'translate', 'status'],
    enabled: pluginOn,
    queryFn: async () => asData<Status>(await api.get('/admin/translate/status')),
  })

  const pushLog = (line: string) => setLog((prev) => [line, ...prev].slice(0, 60))

  const runWarmup = useCallback(async (purgeFirst: boolean) => {
    setRunning(true)
    pushLog(purgeFirst ? 'Очистка фейков + прогрев…' : 'Старт прогрева…')
    try {
      if (purgeFirst) {
        const purged = asData<{ purged?: number; message?: string }>(
          await api.post('/admin/translate/purge-invalid', {}),
        )
        pushLog(purged.message || `Удалено фейков: ${purged.purged ?? 0}`)
      }

      let guard = 0
      let idleRounds = 0
      while (guard < 800) {
        guard++
        const res = asData<WarmupResult>(
          await api.post('/admin/translate/warmup', {
            batch_size: 5,
            purge_invalid: false,
          }),
        )
        if (res.translated > 0 && res.target) {
          idleRounds = 0
          pushLog(
            `${res.target}: +${res.translated}`
            + (res.failed ? ` · fail ${res.failed}` : '')
            + ` · осталось ~${res.remaining_for_target} · кэш ${res.cache?.rows ?? '—'}`,
          )
        } else if (res.finished || res.ready) {
          pushLog('Готово: все фразы в кэше с реальным переводом.')
          break
        } else if ((res.failed ?? 0) > 0 && res.translated === 0) {
          idleRounds++
          if (res.quota_hit || res.provider_hint) {
            pushLog(res.provider_hint || 'Провайдер ограничил запросы — подождите и продолжите.')
            break
          }
          pushLog(`${res.target ?? '?'}: провайдер не ответил (${res.failed}), пауза…`)
          if (idleRounds >= 8) {
            pushLog('Слишком много отказов. Проверьте Плагины → Переводчик → движок Google и повторите прогрев.')
            break
          }
          await new Promise((r) => setTimeout(r, 2500))
          continue
        } else {
          idleRounds++
          const tgt = res.target ?? '?'
          pushLog(
            `Нет прогресса (${tgt}, осталось ~${res.remaining_for_target ?? '?'}). `
            + (idleRounds >= 3 ? 'Проверьте исходный язык ≠ целевым в Плагины → Переводчик.' : 'Повтор…'),
          )
          if (idleRounds >= 5) break
        }
        if (res.finished || res.ready) break
        // Gentle pacing for free providers
        await new Promise((r) => setTimeout(r, 800))
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
        <AdminPageHero
          title="Переводчик сайта"
          hint="Сайт показывает только готовый кэш. Прогрев (или сохранение контента) реально переводит фразы."
          eyebrow="Контент"
          accent="sky"
          actions={
            <>
              <Button
                type="button"
                className="border border-white/10 bg-transparent"
                disabled={refresh.isPending || running}
                onClick={() => refresh.mutate()}
              >
                <RefreshCw size={15} className={refresh.isPending ? 'animate-spin' : undefined} />
                Обновить
              </Button>
              <Button
                type="button"
                className="border border-amber-500/30 bg-amber-500/10 text-amber-100"
                disabled={running}
                onClick={() => void runWarmup(true)}
              >
                {running ? <Loader2 size={15} className="animate-spin" /> : <Eraser size={15} />}
                Очистить фейки и прогреть
              </Button>
              <Button type="button" disabled={running} onClick={() => void runWarmup(false)}>
                {running ? <Loader2 size={15} className="animate-spin" /> : <Play size={15} />}
                {running ? 'Прогрев…' : 'Прогнать контент'}
              </Button>
            </>
          }
        >
          <p className="text-sm text-zinc-500">
            Настройки —{' '}
            <Link to={adminUrl('/plugins')} className="underline hover:text-zinc-300">Плагины → Переводчик</Link>.
          </p>
        </AdminPageHero>

        {status.isLoading || !status.data || Array.isArray(status.data) || !status.data.cache ? (
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
              <p className="mt-1 text-2xl">{status.data.cache?.rows ?? 0}</p>
              <p className="mt-1 text-xs text-zinc-500">движок: {status.data.provider}</p>
            </GlassPanel>
            <GlassPanel className="p-4">
              <p className="text-xs uppercase tracking-wider text-zinc-500">Статус</p>
              <p className={`mt-1 text-lg ${status.data.ready ? 'text-emerald-300' : 'text-amber-200'}`}>
                {status.data.ready ? 'Кэш готов — перевод мгновенный' : 'Нужен прогрев кэша'}
              </p>
              <p className="mt-1 text-xs text-zinc-500">
                {status.data.sync_on_save !== false ? 'синк при сохранении вкл' : 'синк при сохранении выкл'}
                {' · '}
                {status.data.auto_warmup !== false ? 'автопрогрев вкл' : 'автопрогрев выкл'}
              </p>
            </GlassPanel>
          </div>
        )}

        {status.data && !Array.isArray(status.data) && Array.isArray(status.data.targets) && (
          <GlassPanel className="p-5">
            <div className="mb-3 flex items-center gap-2 text-sm font-medium text-zinc-200">
              <Languages size={16} /> Осталось перевести по языкам
            </div>
            <div className="flex flex-wrap gap-2">
              {status.data.targets.map((code) => {
                const miss = status.data!.missing?.[code] ?? 0
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
              Если в БД «перевод» = русский оригинал — это фейк. Жмите «Очистить фейки и прогреть».
              После правок страниц/статей новые фразы переводятся при сохранении (или через MCP / эту кнопку).
              После обновления CMS один раз прогрейте кэш — виджет на сайте добьёт промахи soft live-fill, но warmup делает это быстрее и без лимитов посетителя.
              Авто-язык по стране (Плагины → Переводчик): первый визит без выбора языка → язык страны или нейтральный English; ручной выбор в виджете сохраняется.
              По умолчанию — бесплатный Google Translate. DeepL только если у вас есть свой API key.
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
