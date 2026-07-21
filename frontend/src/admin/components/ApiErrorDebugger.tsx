import { useCallback, useEffect, useState } from 'react'
import { Bug, Copy, Trash2, X } from 'lucide-react'
import { api, ApiRequestError, type ApiErrorDetails, subscribeApiErrors } from '@/lib/api'
import { copyToClipboard } from '@/lib/clipboard'

function formatReport(details: ApiErrorDetails): string {
  const lines = [
    `=== API Error ===`,
    `Time: ${details.at || new Date().toISOString()}`,
    `Status: ${details.status ?? '—'}`,
    `Method: ${details.method || '—'} ${details.url || ''}`,
    `Message: ${details.message}`,
    details.type ? `Type: ${details.type}` : '',
    details.file ? `File: ${details.file}:${details.line ?? '?'}` : '',
    details.php ? `PHP: ${details.php}` : '',
    details.request
      ? `Request: ${details.request.method || ''} ${details.request.uri || ''}`
      : '',
    '',
    '--- Trace ---',
    ...(details.trace?.length
      ? details.trace.map((t, i) => {
          const loc = t.file ? `${t.file}:${t.line ?? '?'}` : '(internal)'
          return `#${i} ${t.fn || '?'} @ ${loc}`
        })
      : ['(no trace)']),
    '',
    '--- Raw ---',
    JSON.stringify(details.raw ?? details, null, 2),
  ]
  return lines.filter((l) => l !== undefined).join('\n')
}

function toolBtn(className = '') {
  return `inline-flex h-9 items-center gap-1.5 rounded-lg border border-white/15 bg-white/5 px-2.5 text-xs text-zinc-100 hover:bg-white/10 disabled:opacity-50 ${className}`
}

export function ApiErrorDebugger() {
  const [open, setOpen] = useState(false)
  const [details, setDetails] = useState<ApiErrorDetails | null>(null)
  const [copied, setCopied] = useState(false)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('')

  useEffect(() => {
    return subscribeApiErrors((err) => {
      setDetails(err)
      setStatus('')
      setOpen(true)
    })
  }, [])

  const loadLast = useCallback(async () => {
    setBusy(true)
    setStatus('Загрузка с сервера…')
    try {
      const res = await api.get<{ data?: ApiErrorDetails | null; message?: string }>(
        '/admin/system/last-error',
        { silent: true },
      )
      const data = res?.data ?? null
      if (!data) {
        setDetails(null)
        setStatus(res?.message || 'На сервере нет сохранённой ошибки')
        setOpen(true)
        return
      }
      setDetails({
        ...data,
        message: data.message || 'Unknown error',
        at: data.at || new Date().toISOString(),
        raw: data,
      })
      setStatus('Загружено с сервера')
      setOpen(true)
    } catch (e) {
      setStatus(e instanceof Error ? e.message : 'Не удалось загрузить last-error')
      setOpen(true)
    } finally {
      setBusy(false)
    }
  }, [])

  const clearAll = useCallback(async () => {
    setBusy(true)
    setStatus('Очистка…')
    try {
      await api.post('/admin/system/last-error/clear', {}, { silent: true })
      setDetails(null)
      setStatus('Очищено (локально и на сервере)')
      setOpen(false)
    } catch (e) {
      // Даже если сервер недоступен — чистим локально
      setDetails(null)
      setOpen(false)
      setStatus(e instanceof Error ? `Локально очищено (${e.message})` : 'Локально очищено')
    } finally {
      setBusy(false)
    }
  }, [])

  const copy = async () => {
    if (!details) return
    const ok = await copyToClipboard(formatReport(details))
    if (ok) {
      setCopied(true)
      setStatus('Скопировано в буфер')
      window.setTimeout(() => setCopied(false), 1500)
    } else {
      setStatus('Не удалось скопировать')
    }
  }

  return (
    <>
      <button
        type="button"
        title="Отладчик API-ошибок"
        onClick={() => {
          if (details) {
            setOpen(true)
          } else {
            void loadLast()
          }
        }}
        className="fixed bottom-4 right-4 z-[80] flex h-11 w-11 items-center justify-center rounded-full border border-white/15 bg-[#151518] text-amber-300 shadow-lg hover:bg-white/5"
      >
        <Bug size={18} />
        {details ? (
          <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-red-500" />
        ) : null}
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-[90] flex items-end justify-center bg-black/60 p-3 sm:items-center"
          onClick={() => setOpen(false)}
          role="presentation"
        >
          <div
            className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#121214] text-zinc-100 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-label="Отладчик API"
          >
            <div className="flex shrink-0 flex-wrap items-start justify-between gap-3 border-b border-white/10 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-[11px] uppercase tracking-wider text-amber-300/90">Отладчик API</p>
                <h2 className="break-words font-heading text-lg font-semibold">
                  {details
                    ? `${details.status ? `${details.status} · ` : ''}${details.message}`
                    : 'Нет активной ошибки'}
                </h2>
                {status ? <p className="mt-1 text-xs text-zinc-400">{status}</p> : null}
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                <button type="button" className={toolBtn()} disabled={!details || busy} onClick={() => void copy()}>
                  <Copy size={14} /> {copied ? 'Скопировано' : 'Копировать'}
                </button>
                <button type="button" className={toolBtn()} disabled={busy} onClick={() => void loadLast()}>
                  <Bug size={14} /> С сервера
                </button>
                <button
                  type="button"
                  className={toolBtn()}
                  disabled={busy}
                  title="Очистить локально и файл на сервере"
                  onClick={() => void clearAll()}
                >
                  <Trash2 size={14} /> Очистить
                </button>
                <button
                  type="button"
                  className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-zinc-400 hover:bg-white/5 hover:text-white"
                  onClick={() => setOpen(false)}
                  title="Закрыть"
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4 text-sm">
              {!details ? (
                <p className="text-zinc-500">
                  Ошибок в памяти нет. Нажмите «С сервера», чтобы подтянуть последний лог, или воспроизведите ошибку снова.
                </p>
              ) : (
                <>
                  <dl className="grid gap-2 sm:grid-cols-2">
                    <div><dt className="text-zinc-500">Тип</dt><dd className="font-mono text-xs">{details.type || '—'}</dd></div>
                    <div><dt className="text-zinc-500">Время</dt><dd className="font-mono text-xs">{details.at || '—'}</dd></div>
                    <div className="sm:col-span-2">
                      <dt className="text-zinc-500">Файл</dt>
                      <dd className="break-all font-mono text-xs text-amber-100/90">
                        {details.file ? `${details.file}:${details.line ?? '?'}` : '—'}
                      </dd>
                    </div>
                    <div className="sm:col-span-2">
                      <dt className="text-zinc-500">Запрос</dt>
                      <dd className="break-all font-mono text-xs">
                        {(details.method || details.request?.method || '') + ' '}
                        {details.url || details.request?.uri || '—'}
                      </dd>
                    </div>
                    {details.php ? (
                      <div><dt className="text-zinc-500">PHP</dt><dd className="font-mono text-xs">{details.php}</dd></div>
                    ) : null}
                  </dl>

                  {details.trace?.length ? (
                    <div>
                      <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">Стек вызовов</p>
                      <ol className="space-y-1 rounded-xl border border-white/10 bg-black/30 p-3 font-mono text-[11px] leading-relaxed text-zinc-300">
                        {details.trace.map((t, i) => (
                          <li key={i}>
                            <span className="text-zinc-600">#{i}</span>{' '}
                            <span className="text-sky-200/90">{t.fn || '?'}</span>
                            <br />
                            <span className="text-zinc-500">{t.file ? `${t.file}:${t.line ?? '?'}` : '(internal)'}</span>
                          </li>
                        ))}
                      </ol>
                    </div>
                  ) : null}

                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">Полный JSON</p>
                    <pre className="overflow-x-auto rounded-xl border border-white/10 bg-black/40 p-3 font-mono text-[11px] text-zinc-300">
                      {JSON.stringify(details.raw ?? details, null, 2)}
                    </pre>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}

export function isApiRequestError(e: unknown): e is ApiRequestError {
  return e instanceof ApiRequestError
}
