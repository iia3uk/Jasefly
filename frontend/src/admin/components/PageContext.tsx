import { ExternalLink } from 'lucide-react'
import { getContext, resolvePublicUrl, type AdminContextKey } from '@/admin/context/registry'
import { t } from '@/admin/i18n'

type Props = {
  contextKey: string
  slug?: string | null
  status?: string | null
  className?: string
}

export function PageContext({ contextKey, slug, status, className = '' }: Props) {
  const ctx = getContext(contextKey)
  const { href, disabledReason } = resolvePublicUrl(ctx, slug, status)

  return (
    <div className={`rounded-xl border border-white/10 bg-white/[0.03] p-4 text-sm ${className}`}>
      <p className="text-zinc-300">{ctx.what}</p>
      <p className="mt-2 text-zinc-500">
        <span className="font-medium text-zinc-400">{t.whereOnSite}: </span>
        {ctx.where}
      </p>
      <div className="mt-3">
        {href ? (
          <a
            href={href}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-300 underline-offset-4 hover:text-white hover:underline"
          >
            {t.openOnSite} <ExternalLink size={12} />
          </a>
        ) : disabledReason === 'publishFirst' ? (
          <span className="text-xs text-amber-400/90">{t.publishFirst}</span>
        ) : null}
      </div>
    </div>
  )
}

export function useAdminContext(key: AdminContextKey | string) {
  return getContext(key)
}
