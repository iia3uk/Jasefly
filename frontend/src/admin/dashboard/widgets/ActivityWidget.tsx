import { Activity } from 'lucide-react'
import { useDashboard } from '@/hooks/useApi'
import { GlassPanel, Skeleton } from '@/components/ui'
import { t } from '@/admin/i18n'
import { formatMoscowDateTime } from '@/admin/lib/formatDateTime'
import { adminUrl } from '@/admin/adminBasePath'
import { ACTION_LABELS, WidgetChrome } from './shared'

export function ActivityWidget() {
  const { data, isLoading } = useDashboard()

  return (
    <WidgetChrome
      title={t.recentActivity}
      hint="Последние действия в админке"
      href={adminUrl('/activity')}
      icon={Activity}
      accent="violet"
    >
      <div className="space-y-2">
        {isLoading ? (
          <Skeleton className="h-40" />
        ) : data?.activity?.length ? (
          data.activity.map((row) => (
            <GlassPanel key={String(row.id)} className="p-3.5">
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm">
                  <span className="text-zinc-300">{ACTION_LABELS[String(row.action)] ?? String(row.action)}</span>
                  {row.entity_type ? <span className="text-zinc-500"> · {String(row.entity_type)}</span> : null}
                  {row.entity_label ? <span className="text-zinc-400"> — {String(row.entity_label)}</span> : null}
                </p>
                <span className="shrink-0 text-[11px] text-zinc-600">
                  {formatMoscowDateTime(String(row.created_at ?? ''))}
                </span>
              </div>
              {row.user_name ? <p className="mt-0.5 text-xs text-zinc-600">{String(row.user_name)}</p> : null}
            </GlassPanel>
          ))
        ) : (
          <p className="py-6 text-center text-sm text-zinc-500">{t.noActivity}</p>
        )}
      </div>
    </WidgetChrome>
  )
}
