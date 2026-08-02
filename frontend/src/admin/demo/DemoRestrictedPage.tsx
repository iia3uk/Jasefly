import { Link } from 'react-router-dom'
import { adminUrl } from '@/admin/adminBasePath'

export function DemoRestrictedPage() {
  return (
    <div className="mx-auto max-w-lg px-6 py-16 text-center" data-demo-restricted>
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-400">Demo restricted</p>
      <h1 className="mt-3 font-heading text-2xl font-semibold text-white">Unavailable in the sandbox</h1>
      <p className="mt-3 text-sm leading-6 text-zinc-400">
        This action or section cannot run in the public demo. Production secrets, deployments, module installs, and user management are blocked on the server — not only hidden in the UI.
      </p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Link to={adminUrl()} className="rounded-xl bg-white/10 px-4 py-2 text-sm font-medium text-white hover:bg-white/15">
          Back to demo dashboard
        </Link>
        <a
          href="https://github.com/iia3uk/jasefly"
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-xl border border-white/15 px-4 py-2 text-sm text-zinc-300 hover:bg-white/5"
        >
          Open GitHub
        </a>
      </div>
    </div>
  )
}
