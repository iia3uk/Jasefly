import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import clsx from 'clsx'
import {
  COLOR_PRESETS,
  hexForNativePicker,
  isCssGradient,
  normalizeHex,
  parseGradient,
  serializeGradient,
  type GradientValue,
} from '@/builder/edit/colorUtils'

type GradientPreset = 'fill' | 'text'

type ColorControlProps = {
  label: string
  value: string
  onChange: (value: string) => void
  /** Allow gradient fills (backgrounds) or gradient text. */
  allowGradient?: boolean
  /** Default stops when switching to Gradient. */
  gradientPreset?: GradientPreset
  allowEmpty?: boolean
  emptyHint?: string
  className?: string
}

const GRADIENT_DEFAULTS: Record<GradientPreset, GradientValue> = {
  fill: {
    type: 'linear',
    angle: 135,
    stops: [
      { color: '#06080c', pos: 0 },
      { color: '#8eb6ff', pos: 100 },
    ],
  },
  text: {
    type: 'linear',
    angle: 90,
    stops: [
      { color: '#8eb6ff', pos: 0 },
      { color: '#e8eaed', pos: 100 },
    ],
  },
}

function useDebouncedCommit(onChange: (v: string) => void, ms = 120) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const latest = useRef(onChange)
  latest.current = onChange

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current)
  }, [])

  return {
    push(v: string) {
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => latest.current(v), ms)
    },
    flush(v: string) {
      if (timer.current) clearTimeout(timer.current)
      timer.current = null
      latest.current(v)
    },
  }
}

function Swatch({ value, className }: { value: string; className?: string }) {
  const empty = !value.trim()
  const checker =
    'linear-gradient(45deg,#3f3f46 25%,transparent 25%),linear-gradient(-45deg,#3f3f46 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#3f3f46 75%),linear-gradient(-45deg,transparent 75%,#3f3f46 75%)'
  return (
    <span
      className={clsx(
        'relative inline-block shrink-0 overflow-hidden rounded-md border border-white/15',
        className,
      )}
      style={
        empty
          ? {
              backgroundColor: '#18181b',
              backgroundImage: checker,
              backgroundSize: '8px 8px',
              backgroundPosition: '0 0, 0 4px, 4px -4px, -4px 0',
            }
          : { background: value }
      }
      title={value || 'пусто'}
    />
  )
}

function nextStopPos(stops: GradientValue['stops']): number {
  if (!stops.length) return 50
  const sorted = [...stops].sort((a, b) => a.pos - b.pos)
  if (sorted.length === 1) return Math.min(100, sorted[0].pos + 50)
  // Place midway in the largest gap
  let bestGap = 0
  let bestPos = 50
  for (let i = 0; i < sorted.length - 1; i++) {
    const gap = sorted[i + 1].pos - sorted[i].pos
    if (gap > bestGap) {
      bestGap = gap
      bestPos = Math.round((sorted[i].pos + sorted[i + 1].pos) / 2)
    }
  }
  if (bestGap < 8) return Math.min(100, sorted[sorted.length - 1].pos)
  return bestPos
}

function normalizeStops(stops: GradientValue['stops']): GradientValue['stops'] {
  const cleaned = stops
    .map((s) => ({
      color: (s.color || '#ffffff').trim() || '#ffffff',
      pos: Math.round(Math.max(0, Math.min(100, Number.isFinite(s.pos) ? s.pos : 0))),
    }))
    .sort((a, b) => a.pos - b.pos)
  // Avoid duplicate positions stacking on top of each other
  for (let i = 1; i < cleaned.length; i++) {
    if (cleaned[i].pos <= cleaned[i - 1].pos) {
      cleaned[i] = { ...cleaned[i], pos: Math.min(100, cleaned[i - 1].pos + 1) }
    }
  }
  return cleaned
}

function GradientEditor({
  value,
  preset,
  onLive,
  onCommit,
}: {
  value: string
  preset: GradientPreset
  onLive: (v: string) => void
  onCommit: (v: string) => void
}) {
  const parsed = parseGradient(value) ?? GRADIENT_DEFAULTS[preset]
  const [g, setG] = useState<GradientValue>(() => ({
    ...parsed,
    stops: normalizeStops(parsed.stops),
  }))

  useEffect(() => {
    const next = parseGradient(value)
    if (next) setG({ ...next, stops: normalizeStops(next.stops) })
  }, [value])

  const emit = (next: GradientValue, commit = false) => {
    const normalized = { ...next, stops: normalizeStops(next.stops) }
    setG(normalized)
    const css = serializeGradient(normalized)
    if (commit) onCommit(css)
    else onLive(css)
  }

  return (
    <div className="space-y-3">
      <div
        className="h-10 w-full rounded-lg border border-white/10"
        style={
          preset === 'text'
            ? {
                backgroundImage: serializeGradient(g),
                backgroundClip: 'text',
                WebkitBackgroundClip: 'text',
                color: 'transparent',
                WebkitTextFillColor: 'transparent',
                fontWeight: 700,
                fontSize: '1.25rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                letterSpacing: '-0.02em',
              }
            : { background: serializeGradient(g) }
        }
      >
        {preset === 'text' ? 'Aa Текст' : null}
      </div>
      <div className="grid grid-cols-2 gap-1">
        {(['linear', 'radial'] as const).map((type) => (
          <button
            key={type}
            type="button"
            className={clsx(
              'rounded-md border px-2 py-1.5 text-[11px]',
              g.type === type
                ? 'border-[var(--accent,#8eb6ff)]/50 bg-[var(--accent,#8eb6ff)]/15 text-white'
                : 'border-white/10 text-zinc-500 hover:text-zinc-300',
            )}
            onClick={() => emit({ ...g, type }, true)}
          >
            {type === 'linear' ? 'Linear' : 'Radial'}
          </button>
        ))}
      </div>
      {g.type === 'linear' && (
        <label className="block space-y-1 text-[11px] text-zinc-500">
          Угол {Math.round(g.angle)}°
          <input
            type="range"
            min={0}
            max={360}
            value={g.angle}
            className="w-full accent-[var(--accent,#8eb6ff)]"
            onChange={(e) => emit({ ...g, angle: Number(e.target.value) })}
            onMouseUp={(e) => emit({ ...g, angle: Number((e.target as HTMLInputElement).value) }, true)}
            onTouchEnd={(e) => emit({ ...g, angle: Number((e.target as HTMLInputElement).value) }, true)}
          />
        </label>
      )}
      <div className="space-y-2">
        {g.stops.map((stop, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <label className="relative h-8 w-8 shrink-0 cursor-pointer overflow-hidden rounded-md border border-white/15">
              <Swatch value={stop.color} className="absolute inset-0 h-full w-full rounded-none border-0" />
              <input
                type="color"
                className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                value={hexForNativePicker(stop.color, '#8eb6ff')}
                onChange={(e) => {
                  const stops = g.stops.map((s, idx) => (idx === i ? { ...s, color: e.target.value } : s))
                  emit({ ...g, stops })
                }}
                onBlur={() => onCommit(serializeGradient({ ...g, stops: normalizeStops(g.stops) }))}
              />
            </label>
            <input
              className="min-w-0 flex-1 rounded-md border border-white/10 bg-white/5 px-2 py-1.5 font-mono text-[11px] text-zinc-200"
              value={stop.color}
              spellCheck={false}
              onChange={(e) => {
                const stops = g.stops.map((s, idx) => (idx === i ? { ...s, color: e.target.value } : s))
                emit({ ...g, stops })
              }}
              onBlur={() => onCommit(serializeGradient({ ...g, stops: normalizeStops(g.stops) }))}
            />
            <label className="flex shrink-0 items-center gap-1 text-[11px] text-zinc-400">
              <input
                type="number"
                min={0}
                max={100}
                className="w-12 appearance-none rounded-md border border-white/10 bg-white/5 px-1.5 py-1.5 text-center text-[11px] text-zinc-200 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                value={Number.isFinite(stop.pos) ? stop.pos : 0}
                onChange={(e) => {
                  const stops = g.stops.map((s, idx) => (idx === i ? { ...s, pos: Number(e.target.value) } : s))
                  emit({ ...g, stops })
                }}
                onBlur={() => onCommit(serializeGradient({ ...g, stops: normalizeStops(g.stops) }))}
              />
              <span className="w-3 shrink-0 text-zinc-500">%</span>
            </label>
            {g.stops.length > 2 ? (
              <button
                type="button"
                className="h-7 w-5 shrink-0 text-center text-[12px] leading-none text-zinc-500 hover:text-red-300"
                title="Удалить стоп"
                onClick={() => emit({ ...g, stops: g.stops.filter((_, idx) => idx !== i) }, true)}
              >
                ×
              </button>
            ) : (
              <span className="w-5 shrink-0" />
            )}
          </div>
        ))}
      </div>
      {g.stops.length < 6 && (
        <button
          type="button"
          className="rounded-md border border-[var(--accent,#8eb6ff)]/35 px-2 py-1 text-[11px] text-[var(--accent,#8eb6ff)] hover:bg-[var(--accent,#8eb6ff)]/10"
          onClick={() =>
            emit({
              ...g,
              stops: [...g.stops, { color: preset === 'text' ? '#ffffff' : '#ffffff', pos: nextStopPos(g.stops) }],
            }, true)
          }
        >
          + стоп
        </button>
      )}
    </div>
  )
}

export function ColorControl({
  label,
  value,
  onChange,
  allowGradient = false,
  gradientPreset = 'fill',
  allowEmpty = true,
  emptyHint = 'по умолчанию',
  className,
}: ColorControlProps) {
  const uid = useId()
  const [open, setOpen] = useState(false)
  const [local, setLocal] = useState(value)
  const panelRef = useRef<HTMLDivElement | null>(null)
  const commit = useDebouncedCommit(onChange, 100)

  useEffect(() => {
    setLocal(value)
  }, [value])

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  const mode: 'solid' | 'gradient' | 'css' = isCssGradient(local)
    ? 'gradient'
    : normalizeHex(local) || !local
      ? 'solid'
      : 'css'

  const setSolidLive = (hex: string) => {
    setLocal(hex)
    commit.push(hex)
  }
  const setSolidCommit = (hex: string) => {
    setLocal(hex)
    commit.flush(hex)
  }
  const setAny = (v: string, immediate = true) => {
    setLocal(v)
    if (immediate) commit.flush(v)
    else commit.push(v)
  }

  const previewStyle = isCssGradient(local) && gradientPreset === 'text'
    ? {
        backgroundImage: local,
        backgroundClip: 'text' as const,
        WebkitBackgroundClip: 'text',
        color: 'transparent',
        WebkitTextFillColor: 'transparent',
      }
    : undefined

  return (
    <div className={clsx('relative space-y-1', className)} ref={panelRef}>
      {label ? <p className="text-xs text-zinc-400">{label}</p> : null}
      <div className="flex items-center gap-2">
        <button
          type="button"
          id={uid}
          className="relative h-9 w-9 shrink-0 overflow-hidden rounded-lg border border-white/15 bg-zinc-900"
          title="Открыть пикер"
          onClick={() => setOpen((v) => !v)}
        >
          {previewStyle ? (
            <span
              className="absolute inset-0 flex items-center justify-center text-[11px] font-bold"
              style={previewStyle}
            >
              Aa
            </span>
          ) : (
            <Swatch value={local} className="absolute inset-0 h-full w-full rounded-none border-0" />
          )}
        </button>
        <input
          className="min-w-0 flex-1 rounded-lg border border-white/10 bg-white/5 px-2.5 py-2 font-mono text-xs text-zinc-200 outline-none focus:border-white/25"
          placeholder={allowEmpty ? emptyHint : '#e8eaed'}
          value={local}
          onChange={(e) => setAny(e.target.value, false)}
          onBlur={() => commit.flush(local)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit.flush(local)
          }}
        />
        {allowEmpty && local ? (
          <button
            type="button"
            className="shrink-0 text-[10px] text-zinc-500 hover:text-white"
            onClick={() => setAny('')}
          >
            сброс
          </button>
        ) : null}
      </div>

      {open && (
        <div className="absolute left-0 right-0 z-50 mt-1 space-y-3 rounded-xl border border-white/15 bg-[#16161a] p-3 shadow-2xl">
          {allowGradient && (
            <div className="grid grid-cols-2 gap-1">
              <button
                type="button"
                className={clsx(
                  'rounded-md border px-2 py-1.5 text-[11px]',
                  mode !== 'gradient'
                    ? 'border-[var(--accent,#8eb6ff)]/50 bg-[var(--accent,#8eb6ff)]/15 text-white'
                    : 'border-white/10 text-zinc-500',
                )}
                onClick={() => setSolidCommit(hexForNativePicker(local, gradientPreset === 'text' ? '#e8eaed' : '#8eb6ff'))}
              >
                Solid
              </button>
              <button
                type="button"
                className={clsx(
                  'rounded-md border px-2 py-1.5 text-[11px]',
                  mode === 'gradient'
                    ? 'border-[var(--accent,#8eb6ff)]/50 bg-[var(--accent,#8eb6ff)]/15 text-white'
                    : 'border-white/10 text-zinc-500',
                )}
                onClick={() => setAny(serializeGradient(GRADIENT_DEFAULTS[gradientPreset]))}
              >
                Gradient
              </button>
            </div>
          )}

          {mode === 'gradient' && allowGradient ? (
            <GradientEditor
              value={local}
              preset={gradientPreset}
              onLive={(v) => {
                setLocal(v)
                commit.push(v)
              }}
              onCommit={(v) => {
                setLocal(v)
                commit.flush(v)
              }}
            />
          ) : (
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <label className="relative h-14 w-14 shrink-0 cursor-pointer overflow-hidden rounded-xl border border-white/15">
                  <Swatch value={normalizeHex(local) ?? local} className="absolute inset-0 h-full w-full rounded-none border-0" />
                  <input
                    type="color"
                    className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                    value={hexForNativePicker(local)}
                    onChange={(e) => setSolidLive(e.target.value)}
                    onBlur={() => commit.flush(local)}
                  />
                </label>
                <div className="min-w-0 flex-1 space-y-1">
                  <p className="text-[10px] uppercase tracking-wider text-zinc-600">Hex / CSS</p>
                  <input
                    className="w-full rounded-md border border-white/10 bg-white/5 px-2 py-1.5 font-mono text-xs text-zinc-200"
                    value={local}
                    onChange={(e) => setAny(e.target.value, false)}
                    onBlur={() => commit.flush(local)}
                  />
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {COLOR_PRESETS.map((p) => (
                  <button
                    key={p.value + p.label}
                    type="button"
                    title={p.label}
                    className="h-7 w-7 overflow-hidden rounded-md border border-white/15"
                    onClick={() => setAny(p.value)}
                  >
                    <Swatch value={p.value} className="h-full w-full rounded-none border-0" />
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/** Tiny helper for places that only need a labeled row without popover chrome duplication. */
export function ColorFieldRow(props: ColorControlProps): ReactNode {
  return <ColorControl {...props} />
}
