import { useMemo } from 'react'
import { useProjects, useStatistics } from '@/hooks/useApi'
import { projectPortfolioStats, type PortfolioStat } from '@/shared/projectPortfolioFeed'

type StatItem = {
  id?: string | number
  value?: string | number | null
  suffix?: string | null
  label?: string | null
}

export function StatsStrip({
  items,
  className = 'grid grid-cols-2 gap-4 border-y border-white/[0.08] py-6 sm:gap-8 sm:py-10 lg:grid-cols-4',
}: {
  items: StatItem[]
  className?: string
}) {
  if (!items.length) return null
  return (
    <div className={className}>
      {items.map((stat) => (
        <div key={String(stat.id)} className="min-w-0">
          <p className="break-words font-heading text-2xl font-semibold tracking-[-0.04em] tabular-nums sm:text-3xl lg:text-4xl">
            {stat.value}{stat.suffix}
          </p>
          <p className="mt-2 text-xs text-[var(--muted)] sm:text-sm">{stat.label}</p>
        </div>
      ))}
    </div>
  )
}

/**
 * Prefers live counts from /projects (≠ cancelled). Falls back to CMS statistics table.
 */
export function useLivePortfolioStats(): PortfolioStat[] {
  const projects = useProjects()
  const cms = useStatistics()
  return useMemo(() => {
    const auto = projectPortfolioStats(projects.data)
    if (projects.data && projects.data.length > 0) return auto
    return (cms.data || []).map((s) => ({
      id: String(s.id),
      value: s.value ?? '',
      suffix: s.suffix ? String(s.suffix) : '',
      label: String(s.label || ''),
    }))
  }, [projects.data, cms.data])
}

/** Drop-in strip that stays in sync with portfolio projects. */
export function LivePortfolioStatsStrip({
  className,
}: {
  className?: string
}) {
  const items = useLivePortfolioStats()
  return <StatsStrip items={items} className={className} />
}
