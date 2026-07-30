/** Lightweight SVG charts for admin analytics — no chart library. */

export type DailyPoint = {
  date: string
  events: number
  visitors: number
  page_views: number
}

function maxOf(nums: number[], fallback = 1): number {
  const m = Math.max(0, ...nums)
  return m > 0 ? m : fallback
}

function pathFrom(
  values: number[],
  w: number,
  h: number,
  pad = 2,
): { line: string; area: string } {
  const n = values.length
  if (n === 0) return { line: '', area: '' }
  const max = maxOf(values)
  const innerW = w - pad * 2
  const innerH = h - pad * 2
  const pts = values.map((v, i) => {
    const x = pad + (n === 1 ? innerW / 2 : (i / (n - 1)) * innerW)
    const y = pad + innerH - (v / max) * innerH
    return [x, y] as const
  })
  const line = pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
  const area = `${line} L${pts[pts.length - 1][0].toFixed(1)},${(h - pad).toFixed(1)} L${pts[0][0].toFixed(1)},${(h - pad).toFixed(1)} Z`
  return { line, area }
}

export function Sparkline({
  values,
  className = '',
  stroke = 'rgb(52 211 153)',
  fill = 'rgb(52 211 153 / 0.18)',
  height = 36,
}: {
  values: number[]
  className?: string
  stroke?: string
  fill?: string
  height?: number
}) {
  const w = 120
  const h = height
  const { line, area } = pathFrom(values.length ? values : [0], w, h)
  const id = `sp-${stroke.replace(/\W/g, '')}-${values.length}`
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className={className} preserveAspectRatio="none" aria-hidden>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={fill} />
          <stop offset="100%" stopColor="transparent" />
        </linearGradient>
      </defs>
      {area ? <path d={area} fill={`url(#${id})`} /> : null}
      {line ? <path d={line} fill="none" stroke={stroke} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" /> : null}
    </svg>
  )
}

export function AreaChart({
  daily,
  metric = 'page_views',
  height = 180,
  className = '',
}: {
  daily: DailyPoint[]
  metric?: keyof Pick<DailyPoint, 'events' | 'visitors' | 'page_views'>
  height?: number
  className?: string
}) {
  const w = 640
  const h = height
  const values = daily.map((d) => Number(d[metric] || 0))
  const { line, area } = pathFrom(values.length ? values : [0, 0], w, h, 8)
  const gradId = `area-${metric}`
  const labels = daily.length
    ? [daily[0]?.date, daily[Math.floor(daily.length / 2)]?.date, daily[daily.length - 1]?.date].filter(Boolean)
    : []

  return (
    <div className={className}>
      <svg viewBox={`0 0 ${w} ${h}`} className="h-auto w-full" role="img" aria-label="График по дням">
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgb(45 212 191 / 0.35)" />
            <stop offset="55%" stopColor="rgb(45 212 191 / 0.08)" />
            <stop offset="100%" stopColor="transparent" />
          </linearGradient>
          <linearGradient id={`${gradId}-stroke`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="rgb(94 234 212)" />
            <stop offset="100%" stopColor="rgb(52 211 153)" />
          </linearGradient>
        </defs>
        {/* grid */}
        {[0.25, 0.5, 0.75].map((t) => (
          <line
            key={t}
            x1="8"
            x2={w - 8}
            y1={8 + (h - 16) * t}
            y2={8 + (h - 16) * t}
            stroke="rgb(255 255 255 / 0.04)"
            strokeWidth="1"
          />
        ))}
        {area ? <path d={area} fill={`url(#${gradId})`} /> : null}
        {line ? (
          <path
            d={line}
            fill="none"
            stroke={`url(#${gradId}-stroke)`}
            strokeWidth="2.25"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ) : null}
      </svg>
      {labels.length ? (
        <div className="mt-1 flex justify-between px-1 text-[10px] tabular-nums text-zinc-600">
          {labels.map((l) => (
            <span key={String(l)}>{String(l).slice(5)}</span>
          ))}
        </div>
      ) : null}
    </div>
  )
}

export function BarRow({
  label,
  value,
  max,
  hint,
  tone = 'teal',
}: {
  label: string
  value: number
  max: number
  hint?: string
  tone?: 'teal' | 'amber' | 'sky'
}) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0
  const bar =
    tone === 'amber'
      ? 'from-amber-400/80 to-orange-400/50'
      : tone === 'sky'
        ? 'from-sky-400/80 to-cyan-400/45'
        : 'from-teal-300/85 to-emerald-400/45'
  return (
    <div className="group">
      <div className="mb-1 flex items-baseline justify-between gap-2 text-xs">
        <span className="min-w-0 truncate font-mono text-zinc-300 group-hover:text-zinc-100">{label || '/'}</span>
        <span className="shrink-0 tabular-nums text-zinc-400">
          {value.toLocaleString('ru')}
          {hint ? <span className="ml-1.5 text-zinc-600">{hint}</span> : null}
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.04]">
        <div
          className={`h-full rounded-full bg-gradient-to-r ${bar} transition-[width] duration-500`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

/** Compare last 7 days of series vs previous 7 (rough trend %). */
export function trendPct(daily: DailyPoint[], key: keyof Pick<DailyPoint, 'events' | 'visitors' | 'page_views'>): number | null {
  if (daily.length < 4) return null
  const vals = daily.map((d) => Number(d[key] || 0))
  const mid = Math.floor(vals.length / 2)
  const older = vals.slice(0, mid)
  const newer = vals.slice(mid)
  const a = older.reduce((s, v) => s + v, 0) / (older.length || 1)
  const b = newer.reduce((s, v) => s + v, 0) / (newer.length || 1)
  if (a === 0 && b === 0) return 0
  if (a === 0) return 100
  return Math.round(((b - a) / a) * 100)
}
