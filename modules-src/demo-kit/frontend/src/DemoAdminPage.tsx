import { useEffect, useState } from 'react'

export function DemoAdminPage() {
  const [phase, setPhase] = useState<'loading' | 'ok' | 'err'>('loading')
  const [payload, setPayload] = useState('')

  useEffect(() => {
    let cancelled = false
    const token = localStorage.getItem('access_token')
    void fetch('/api/v1/admin/demo-kit/ping', {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      credentials: 'same-origin',
    })
      .then(async (res) => {
        const text = await res.text()
        let pretty = text
        try {
          pretty = JSON.stringify(JSON.parse(text), null, 2)
        } catch {
          /* keep raw */
        }
        if (cancelled) return
        setPayload(pretty)
        setPhase(res.ok ? 'ok' : 'err')
      })
      .catch((e: unknown) => {
        if (cancelled) return
        setPayload(e instanceof Error ? e.message : String(e))
        setPhase('err')
      })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="p-6 space-y-4 max-w-2xl">
      <h1 className="text-xl font-semibold">Demo Kit</h1>
      <p className="text-sm text-zinc-500">GET /api/v1/admin/demo-kit/ping</p>
      <pre
        className={
          'overflow-auto rounded-lg border border-white/10 bg-black/40 p-4 text-xs whitespace-pre-wrap ' +
          (phase === 'ok' ? 'text-emerald-200' : phase === 'err' ? 'text-red-300' : 'text-zinc-400')
        }
      >
        {phase === 'loading' ? 'Запрос ping…' : payload}
      </pre>
    </div>
  )
}

export default DemoAdminPage
