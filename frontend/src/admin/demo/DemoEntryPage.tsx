import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { api } from '@/lib/api'
import { useAuth } from '@/context/AuthContext'
import { adminUrl, isAdminPathname } from '@/admin/adminBasePath'

/**
 * Public entry: POST /auth/demo/start → store demo JWT → admin shell.
 * Route: /demo (outside secret admin base) and {adminBase}/demo/start
 *
 * Query:
 *   ?to=builder — open Demo Home in page builder (default)
 *   ?to=admin — open admin dashboard
 *   ?next=/admin/... — explicit admin path (canonical or with custom base)
 */
export function DemoEntryPage() {
  const { acceptDemoSession } = useAuth()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await api.post<{ data?: Record<string, unknown> }>('/auth/demo/start', {})
        const data = (res as { data?: Record<string, unknown> })?.data ?? (res as Record<string, unknown>)
        if (cancelled) return
        acceptDemoSession(data)

        const to = (params.get('to') || '').toLowerCase().trim()
        const nextRaw = (params.get('next') || '').trim()
        let dest = adminUrl()

        if (nextRaw) {
          const pathOnly = nextRaw.split('?')[0] || ''
          if (isAdminPathname(pathOnly) && !pathOnly.endsWith('/login')) {
            dest = nextRaw.startsWith('/') ? nextRaw : `/${nextRaw}`
          }
        } else if (to === 'admin' || to === 'dashboard' || to === 'panel') {
          dest = adminUrl()
        } else {
          // builder (default) — isolated page editor
          const homeId = Number(data.home_page_id ?? 900001)
          dest = adminUrl(`/pages/${homeId}/builder`)
        }

        navigate(dest, { replace: true })
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Demo unavailable')
        }
      }
    })()
    return () => { cancelled = true }
  }, [acceptDemoSession, navigate, params])

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0a0a0b] px-6 text-center text-zinc-200">
        <div>
          <h1 className="text-xl font-semibold">Demo sandbox unavailable</h1>
          <p className="mt-2 text-sm text-zinc-400">{error}</p>
          <a href="/" className="mt-6 inline-block text-sm text-amber-300 underline">Back to site</a>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0a0a0b] text-sm text-zinc-400">
      Starting isolated demo session…
    </div>
  )
}
