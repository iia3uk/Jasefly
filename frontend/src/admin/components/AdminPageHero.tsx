import type { ReactNode } from 'react'
import { GlassPanel } from '@/components/ui'

export type AdminAccent = 'teal' | 'sky' | 'violet' | 'amber' | 'rose' | 'emerald' | 'cyan'

const GLOW: Record<AdminAccent, string> = {
  teal: 'radial-gradient(ellipse 65% 90% at 0% 0%, rgb(45 212 191 / 0.14), transparent 58%)',
  sky: 'radial-gradient(ellipse 65% 90% at 0% 0%, rgb(56 189 248 / 0.14), transparent 58%)',
  violet: 'radial-gradient(ellipse 65% 90% at 0% 0%, rgb(167 139 250 / 0.14), transparent 58%)',
  amber: 'radial-gradient(ellipse 65% 90% at 0% 0%, rgb(251 191 36 / 0.12), transparent 58%)',
  rose: 'radial-gradient(ellipse 65% 90% at 0% 0%, rgb(251 113 133 / 0.12), transparent 58%)',
  emerald: 'radial-gradient(ellipse 65% 90% at 0% 0%, rgb(52 211 153 / 0.14), transparent 58%)',
  cyan: 'radial-gradient(ellipse 65% 90% at 0% 0%, rgb(34 211 238 / 0.14), transparent 58%)',
}

const EYEBROW: Record<AdminAccent, string> = {
  teal: 'text-teal-300/75',
  sky: 'text-sky-300/75',
  violet: 'text-violet-300/75',
  amber: 'text-amber-300/75',
  rose: 'text-rose-300/75',
  emerald: 'text-emerald-300/75',
  cyan: 'text-cyan-300/75',
}

export function adminAccentGlow(accent: AdminAccent = 'teal'): string {
  return GLOW[accent] ?? GLOW.teal
}

export type AdminHeroStat = {
  label: string
  value: ReactNode
  tone?: string
}

type Props = {
  title: string
  hint?: string
  eyebrow?: string
  accent?: AdminAccent
  actions?: ReactNode
  stats?: AdminHeroStat[]
  children?: ReactNode
  className?: string
}

export function AdminPageHero({
  title,
  hint,
  eyebrow,
  accent = 'teal',
  actions,
  stats,
  children,
  className = '',
}: Props) {
  return (
    <GlassPanel className={`relative mb-6 overflow-hidden p-0 ${className}`}>
      <div
        className="pointer-events-none absolute inset-0"
        style={{ background: adminAccentGlow(accent) }}
        aria-hidden
      />
      <div className="relative space-y-3 p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            {eyebrow ? (
              <p className={`text-[11px] uppercase tracking-[0.16em] ${EYEBROW[accent]}`}>{eyebrow}</p>
            ) : null}
            <h1 className={`font-heading text-2xl text-zinc-50 sm:text-3xl ${eyebrow ? 'mt-1' : ''}`}>
              {title}
            </h1>
          </div>
          {(actions || (stats && stats.length > 0)) && (
            <div className="flex flex-wrap items-end gap-2">
              {stats?.map((s) => (
                <div
                  key={s.label}
                  className="min-w-[4.25rem] rounded-xl border border-white/[0.08] bg-black/30 px-3 py-2 text-center"
                >
                  <p className="text-[10px] uppercase tracking-wide text-zinc-500">{s.label}</p>
                  <p className={`font-heading text-xl tabular-nums ${s.tone ?? 'text-zinc-100'}`}>
                    {s.value}
                  </p>
                </div>
              ))}
              {actions}
            </div>
          )}
        </div>
        {hint ? <p className="max-w-3xl text-sm leading-relaxed text-zinc-400">{hint}</p> : null}
        {children ? <div>{children}</div> : null}
      </div>
    </GlassPanel>
  )
}

/** Category / section label with gradient rule. */
export function AdminSectionLabel({
  children,
  count,
}: {
  children: ReactNode
  count?: number | string
}) {
  return (
    <div className="mb-3 flex items-center gap-3">
      <h2 className="font-heading text-sm uppercase tracking-[0.14em] text-zinc-400">{children}</h2>
      <div className="h-px flex-1 bg-gradient-to-r from-white/10 to-transparent" />
      {count != null ? (
        <span className="text-[11px] tabular-nums text-zinc-600">{count}</span>
      ) : null}
    </div>
  )
}
