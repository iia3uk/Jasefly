/** True if value is a CSS gradient (linear/radial/conic). */
export function isCssGradient(value: string | null | undefined): boolean {
  if (!value) return false
  return /(?:linear|radial|conic)-gradient\s*\(/i.test(value)
}

/** Expand #rgb → #rrggbb; return null if not a plain hex. */
export function normalizeHex(value: string | null | undefined): string | null {
  if (!value) return null
  const v = value.trim()
  const short = /^#([0-9a-f]{3})$/i.exec(v)
  if (short) {
    const [r, g, b] = short[1].split('')
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase()
  }
  const full = /^#([0-9a-f]{6})$/i.exec(v)
  if (full) return `#${full[1]}`.toLowerCase()
  return null
}

/** Hex for `<input type="color">` only — never feed CSS vars / gradients into it. */
export function hexForNativePicker(value: string | null | undefined, fallback = '#e8eaed'): string {
  return normalizeHex(value) ?? fallback
}

export type GradientStop = { color: string; pos: number }
export type GradientValue = {
  type: 'linear' | 'radial'
  angle: number
  stops: GradientStop[]
}

const STOP_RE = /(#[0-9a-f]{3,8}|rgba?\([^)]+\)|hsla?\([^)]+\)|var\([^)]+\))\s+(\d+(?:\.\d+)?)%/gi

export function parseGradient(value: string | null | undefined): GradientValue | null {
  if (!value || !isCssGradient(value)) return null
  const linear = /linear-gradient\s*\(\s*([-\d.]+)deg\s*,([\s\S]+)\)/i.exec(value)
  const radial = /radial-gradient\s*\(\s*([^,]+)\s*,([\s\S]+)\)/i.exec(value)
  const body = linear?.[2] ?? radial?.[2]
  if (!body) return null
  const stops: GradientStop[] = []
  let m: RegExpExecArray | null
  const re = new RegExp(STOP_RE.source, 'gi')
  while ((m = re.exec(body)) !== null) {
    stops.push({ color: m[1], pos: Number(m[2]) })
  }
  if (stops.length < 2) {
    return {
      type: linear ? 'linear' : 'radial',
      angle: linear ? Number(linear[1]) || 180 : 180,
      stops: [
        { color: '#06080c', pos: 0 },
        { color: '#8eb6ff', pos: 100 },
      ],
    }
  }
  return {
    type: linear ? 'linear' : 'radial',
    angle: linear ? Number(linear[1]) || 180 : 180,
    stops: stops.sort((a, b) => a.pos - b.pos),
  }
}

export function serializeGradient(g: GradientValue): string {
  const stops = [...g.stops]
    .sort((a, b) => a.pos - b.pos)
    .map((s) => `${s.color} ${Math.round(Math.max(0, Math.min(100, s.pos)))}%`)
    .join(', ')
  if (g.type === 'radial') {
    return `radial-gradient(circle at 50% 50%, ${stops})`
  }
  return `linear-gradient(${Math.round(g.angle)}deg, ${stops})`
}

export const COLOR_PRESETS = [
  { label: 'Текст', value: '#e8eaed' },
  { label: 'Мутный', value: '#9aa3b2' },
  { label: 'Акцент', value: 'var(--accent)' },
  { label: 'Primary', value: 'var(--primary)' },
  { label: 'Фон', value: 'var(--background)' },
  { label: 'Белый', value: '#ffffff' },
  { label: 'Чёрный', value: '#000000' },
  { label: 'Синий', value: '#8eb6ff' },
] as const
