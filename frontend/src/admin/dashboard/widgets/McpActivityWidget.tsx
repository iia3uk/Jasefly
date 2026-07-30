import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Bot } from 'lucide-react'
import { endpoints } from '@/lib/api'
import { Skeleton } from '@/components/ui'
import { t } from '@/admin/i18n'
import { formatMoscowDateTime } from '@/admin/lib/formatDateTime'
import { adminUrl } from '@/admin/adminBasePath'
import { ACTION_LABELS, WidgetChrome } from './shared'

export function McpActivityWidget() {
  const mcpActivity = useQuery({
    queryKey: ['activity', 'mcp', 'dashboard'],
    queryFn: () => endpoints.activity({ source: 'mcp', limit: 8 }),
  })

  return (
    <WidgetChrome
      title={t.mcpStrip}
      hint={t.mcpStripHint}
      href={adminUrl('/activity?source=mcp')}
      icon={Bot}
      accent="cyan"
    >
      <div className="space-y-2">
        {mcpActivity.isLoading ? (
          <Skeleton className="h-28" />
        ) : mcpActivity.data?.length ? (
          mcpActivity.data.map((row) => (
            <div key={String(row.id)} className="rounded-lg border border-white/5 bg-black/20 px-3 py-2">
              <div className="flex items-start justify-between gap-2">
                <p className="min-w-0 text-sm">
                  <span className="mr-2 rounded border border-cyan-400/30 bg-cyan-500/10 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-cyan-200">
                    MCP
                  </span>
                  <span className="text-zinc-300">{ACTION_LABELS[String(row.action)] ?? String(row.action)}</span>
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
      <Link
        to={adminUrl('/activity?source=mcp')}
        className="mt-3 inline-flex text-xs text-cyan-200/90 underline-offset-2 hover:underline"
      >
        {t.mcpStripAll}
      </Link>
    </WidgetChrome>
  )
}
