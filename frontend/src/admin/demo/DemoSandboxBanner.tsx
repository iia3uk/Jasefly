import { Link } from 'react-router-dom'
import { api } from '@/lib/api'
import { useAuth } from '@/context/AuthContext'
import { adminUrl } from '@/admin/adminBasePath'

export function DemoSandboxBanner() {
  const { isDemo, refreshCapabilities } = useAuth()
  if (!isDemo) return null

  const reset = async () => {
    await api.post('/auth/demo/reset', {})
    await refreshCapabilities()
    window.location.reload()
  }

  const end = async () => {
    await api.post('/auth/demo/end', {}).catch(() => undefined)
    localStorage.removeItem('access_token')
    localStorage.removeItem('refresh_token')
    localStorage.removeItem('is_demo')
    localStorage.removeItem('user_name')
    localStorage.removeItem('user_role')
    window.location.href = '/'
  }

  return (
    <div
      data-demo-sandbox-banner
      className="sticky top-0 z-40 flex flex-wrap items-center justify-between gap-2 border-b border-amber-500/30 bg-amber-500/10 px-4 py-2 text-sm text-amber-100"
    >
      <div className="min-w-0">
        <span className="font-semibold tracking-wide">DEMO SANDBOX</span>
        <span className="ml-2 text-amber-100/80">Changes are isolated and automatically reset.</span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => void reset()}
          className="rounded-lg border border-amber-400/40 bg-amber-500/15 px-3 py-1 text-xs font-medium hover:bg-amber-500/25"
        >
          Reset demo
        </button>
        <a
          href="https://github.com/iia3uk/jasefly"
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-lg border border-white/15 px-3 py-1 text-xs font-medium hover:bg-white/5"
        >
          View source on GitHub
        </a>
        <Link to={adminUrl('/demo/exit')} onClick={(e) => { e.preventDefault(); void end() }} className="text-xs text-amber-100/70 underline-offset-2 hover:underline">
          Exit demo
        </Link>
      </div>
    </div>
  )
}
