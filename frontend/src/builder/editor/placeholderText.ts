/** Placeholder / seed strings that must never overwrite real copy. */
const PLACEHOLDER_EXACT = new Set([
  '',
  'заголовок',
  'headline',
  'подзаголовок',
  'subheader',
  'subtitle',
  'бейдж',
  'беидж',
  'badge',
  'текст',
  'text',
  'asd',
  'awd',
  'кнопка',
  'button',
  'cta',
])

/**
 * True when value is empty or a known builder/admin stub
 * (e.g. "Заголовок", "asd", "беидж") — not real site copy.
 */
export function isPlaceholderText(v: unknown): boolean {
  if (v == null) return true
  const s = String(v).trim()
  if (!s) return true
  return PLACEHOLDER_EXACT.has(s.toLowerCase())
}

/**
 * Prefer real copy over stubs. If both are real or both stubs, prefer `preferred`.
 */
export function preferRealText(preferred: unknown, fallback: unknown): string {
  const p = preferred != null ? String(preferred) : ''
  const f = fallback != null ? String(fallback) : ''
  const pStub = isPlaceholderText(p)
  const fStub = isPlaceholderText(f)
  if (!pStub) return p
  if (!fStub) return f
  return p || f
}
