import { FileText } from 'lucide-react'
import { useDashboard } from '@/hooks/useApi'
import { Skeleton } from '@/components/ui'
import { adminUrl } from '@/admin/adminBasePath'
import { WidgetChrome } from './shared'

export function BlogPulseWidget() {
  const { data, isLoading } = useDashboard()
  const publish = data?.publish?.posts ?? {}
  const published = publish.published ?? 0
  const draft = publish.draft ?? 0
  const archived = publish.archived ?? 0
  const total = published + draft + archived || 1
  const week = data?.recent?.posts_7d ?? 0
  const count = data?.counts?.blog_posts ?? 0

  return (
    <WidgetChrome
      title="Блог"
      hint="Пульс публикаций"
      href={adminUrl('/blog')}
      icon={FileText}
      accent="emerald"
    >
      {isLoading ? (
        <Skeleton className="h-36" />
      ) : (
        <>
          <div className="mb-3 grid grid-cols-3 gap-2">
            <div className="rounded-xl border border-white/[0.06] bg-black/25 px-2.5 py-2">
              <p className="text-[10px] text-zinc-500">Всего</p>
              <p className="font-heading text-xl tabular-nums">{count}</p>
            </div>
            <div className="rounded-xl border border-emerald-400/20 bg-emerald-500/10 px-2.5 py-2">
              <p className="text-[10px] text-emerald-200/70">За 7 дней</p>
              <p className="font-heading text-xl tabular-nums text-emerald-100">{week}</p>
            </div>
            <div className="rounded-xl border border-amber-400/15 bg-amber-500/5 px-2.5 py-2">
              <p className="text-[10px] text-amber-200/70">Черновики</p>
              <p className="font-heading text-xl tabular-nums text-amber-100">{draft}</p>
            </div>
          </div>
          <div className="space-y-2.5">
            {[
              { label: 'Опубликовано', n: published, tone: 'bg-emerald-400/70' },
              { label: 'Черновики', n: draft, tone: 'bg-amber-400/60' },
              { label: 'Архив', n: archived, tone: 'bg-zinc-500/60' },
            ].map((row) => (
              <div key={row.label}>
                <div className="mb-0.5 flex justify-between text-xs text-zinc-400">
                  <span>{row.label}</span>
                  <span className="tabular-nums">{row.n}</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-white/5">
                  <div
                    className={`h-full rounded-full ${row.tone}`}
                    style={{ width: `${Math.round((row.n / total) * 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </WidgetChrome>
  )
}
