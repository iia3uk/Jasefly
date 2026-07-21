export type GoogleFontCategory = 'sans' | 'serif' | 'display' | 'mono'

export type GoogleFontPreset = {
  label: string
  /** CSS font-family value, e.g. `"Inter", sans-serif` */
  value: string
  /** Google Fonts family name for the CSS API */
  family: string
  category: GoogleFontCategory
}

const CATEGORY_LABELS: Record<GoogleFontCategory, string> = {
  sans: 'Sans-serif',
  serif: 'Serif',
  display: 'Display',
  mono: 'Mono',
}

/** Curated Google Fonts — many with Cyrillic for RU sites. */
export const GOOGLE_FONT_PRESETS: GoogleFontPreset[] = [
  { label: 'Inter', family: 'Inter', value: '"Inter", sans-serif', category: 'sans' },
  { label: 'Roboto', family: 'Roboto', value: '"Roboto", sans-serif', category: 'sans' },
  { label: 'Open Sans', family: 'Open Sans', value: '"Open Sans", sans-serif', category: 'sans' },
  { label: 'Montserrat', family: 'Montserrat', value: '"Montserrat", sans-serif', category: 'sans' },
  { label: 'Poppins', family: 'Poppins', value: '"Poppins", sans-serif', category: 'sans' },
  { label: 'Lato', family: 'Lato', value: '"Lato", sans-serif', category: 'sans' },
  { label: 'Nunito', family: 'Nunito', value: '"Nunito", sans-serif', category: 'sans' },
  { label: 'Rubik', family: 'Rubik', value: '"Rubik", sans-serif', category: 'sans' },
  { label: 'Manrope', family: 'Manrope', value: '"Manrope", sans-serif', category: 'sans' },
  { label: 'Outfit', family: 'Outfit', value: '"Outfit", sans-serif', category: 'sans' },
  { label: 'Plus Jakarta Sans', family: 'Plus Jakarta Sans', value: '"Plus Jakarta Sans", sans-serif', category: 'sans' },
  { label: 'DM Sans', family: 'DM Sans', value: '"DM Sans", sans-serif', category: 'sans' },
  { label: 'Sora', family: 'Sora', value: '"Sora", sans-serif', category: 'sans' },
  { label: 'Space Grotesk', family: 'Space Grotesk', value: '"Space Grotesk", sans-serif', category: 'sans' },
  { label: 'Work Sans', family: 'Work Sans', value: '"Work Sans", sans-serif', category: 'sans' },
  { label: 'Source Sans 3', family: 'Source Sans 3', value: '"Source Sans 3", sans-serif', category: 'sans' },
  { label: 'IBM Plex Sans', family: 'IBM Plex Sans', value: '"IBM Plex Sans", sans-serif', category: 'sans' },
  { label: 'PT Sans', family: 'PT Sans', value: '"PT Sans", sans-serif', category: 'sans' },
  { label: 'Ubuntu', family: 'Ubuntu', value: '"Ubuntu", sans-serif', category: 'sans' },
  { label: 'Fira Sans', family: 'Fira Sans', value: '"Fira Sans", sans-serif', category: 'sans' },
  { label: 'Raleway', family: 'Raleway', value: '"Raleway", sans-serif', category: 'sans' },
  { label: 'Oswald', family: 'Oswald', value: '"Oswald", sans-serif', category: 'display' },
  { label: 'Playfair Display', family: 'Playfair Display', value: '"Playfair Display", serif', category: 'serif' },
  { label: 'Merriweather', family: 'Merriweather', value: '"Merriweather", serif', category: 'serif' },
  { label: 'Lora', family: 'Lora', value: '"Lora", serif', category: 'serif' },
  { label: 'PT Serif', family: 'PT Serif', value: '"PT Serif", serif', category: 'serif' },
  { label: 'Cormorant Garamond', family: 'Cormorant Garamond', value: '"Cormorant Garamond", serif', category: 'serif' },
  { label: 'Literata', family: 'Literata', value: '"Literata", serif', category: 'serif' },
  { label: 'Fraunces', family: 'Fraunces', value: '"Fraunces", serif', category: 'display' },
  { label: 'Instrument Serif', family: 'Instrument Serif', value: '"Instrument Serif", serif', category: 'serif' },
  { label: 'JetBrains Mono', family: 'JetBrains Mono', value: '"JetBrains Mono", monospace', category: 'mono' },
  { label: 'Roboto Mono', family: 'Roboto Mono', value: '"Roboto Mono", monospace', category: 'mono' },
  { label: 'IBM Plex Mono', family: 'IBM Plex Mono', value: '"IBM Plex Mono", monospace', category: 'mono' },
]

export const SYSTEM_FONT_OPTIONS = [
  { label: 'System UI', value: 'system-ui, -apple-system, sans-serif' },
  { label: 'Georgia', value: 'Georgia, "Times New Roman", serif' },
  { label: 'Times New Roman', value: '"Times New Roman", Times, serif' },
  { label: 'Arial', value: 'Arial, Helvetica, sans-serif' },
  { label: 'Courier New', value: '"Courier New", Courier, monospace' },
] as const

export const CUSTOM_FONT_VALUE = '__custom__'

const LINK_ID = 'jasefly-google-fonts-dynamic'
const loadedFamilies = new Set<string>(['DM Sans', 'Sora'])

export function categoryLabel(cat: GoogleFontCategory): string {
  return CATEGORY_LABELS[cat]
}

export function presetsByCategory(): { category: GoogleFontCategory; label: string; fonts: GoogleFontPreset[] }[] {
  const order: GoogleFontCategory[] = ['sans', 'serif', 'display', 'mono']
  return order.map((category) => ({
    category,
    label: CATEGORY_LABELS[category],
    fonts: GOOGLE_FONT_PRESETS.filter((f) => f.category === category),
  }))
}

/** Extract first family name from a CSS font-family stack. */
export function parseFontFamilyName(cssValue: string | null | undefined): string | null {
  const raw = String(cssValue || '').trim()
  if (!raw) return null
  const first = raw.split(',')[0]?.trim() || ''
  const name = first.replace(/^["']|["']$/g, '').trim()
  return name || null
}

export function findGoogleFontPreset(cssValue: string | null | undefined): GoogleFontPreset | undefined {
  const v = String(cssValue || '').trim()
  if (!v) return undefined
  const byValue = GOOGLE_FONT_PRESETS.find((f) => f.value === v)
  if (byValue) return byValue
  const name = parseFontFamilyName(v)
  if (!name) return undefined
  return GOOGLE_FONT_PRESETS.find((f) => f.family.toLowerCase() === name.toLowerCase())
}

export function isKnownFontStack(cssValue: string | null | undefined): boolean {
  const v = String(cssValue || '').trim()
  if (!v) return true
  if (findGoogleFontPreset(v)) return true
  return SYSTEM_FONT_OPTIONS.some((f) => f.value === v)
}

export function googleFontsCssUrl(families: string[]): string {
  const unique = [...new Set(families.map((f) => f.trim()).filter(Boolean))]
  if (!unique.length) return ''
  const q = unique
    .map((f) => `family=${encodeURIComponent(f)}:ital,wght@0,400;0,500;0,600;0,700;1,400`)
    .join('&')
  return `https://fonts.googleapis.com/css2?${q}&display=swap`
}

/** Inject / update a stylesheet link for the given Google Font families. */
export function ensureGoogleFontsLoaded(families: string[]): void {
  if (typeof document === 'undefined') return
  const next = families.map((f) => f.trim()).filter((f) => f && !loadedFamilies.has(f))
  if (!next.length && document.getElementById(LINK_ID)) return

  next.forEach((f) => loadedFamilies.add(f))
  const all = [...loadedFamilies]
  const href = googleFontsCssUrl(all)
  if (!href) return

  let link = document.getElementById(LINK_ID) as HTMLLinkElement | null
  if (!link) {
    link = document.createElement('link')
    link.id = LINK_ID
    link.rel = 'stylesheet'
    document.head.appendChild(link)
  }
  if (link.href !== href) link.href = href
}

export function ensureFontCssValueLoaded(cssValue: string | null | undefined): void {
  const preset = findGoogleFontPreset(cssValue)
  if (preset) ensureGoogleFontsLoaded([preset.family])
  else {
    const name = parseFontFamilyName(cssValue)
    // Custom Google-like name typed by hand
    if (name && !/^(system-ui|Arial|Georgia|Times|Courier|ui-monospace|sans-serif|serif|monospace)/i.test(name)) {
      ensureGoogleFontsLoaded([name])
    }
  }
}

type LayoutElementLike = {
  settings?: Record<string, unknown>
  elements?: LayoutElementLike[]
}

type LayoutLike = {
  elements?: LayoutElementLike[]
} | null | undefined

function addCssFont(css: string | null | undefined, into: Set<string>) {
  const preset = findGoogleFontPreset(css)
  if (preset) into.add(preset.family)
}

function collectFromSettings(settings: Record<string, unknown> | undefined, into: Set<string>) {
  if (!settings) return
  const styles = settings.styles
  if (styles && typeof styles === 'object') {
    addCssFont((styles as { fontFamily?: string }).fontFamily, into)
  }
  const fieldStyles = settings.fieldStyles
  if (fieldStyles && typeof fieldStyles === 'object') {
    for (const bag of Object.values(fieldStyles as Record<string, { fontFamily?: string }>)) {
      if (!bag || typeof bag !== 'object') continue
      addCssFont(bag.fontFamily, into)
    }
  }
}

function walkElements(els: LayoutElementLike[] | undefined, into: Set<string>) {
  for (const el of els ?? []) {
    collectFromSettings(el.settings, into)
    if (el.elements?.length) walkElements(el.elements, into)
  }
}

/** Collect Google Font family names used in a page layout. */
export function collectGoogleFontsFromLayout(layout: LayoutLike): string[] {
  const into = new Set<string>()
  walkElements(layout?.elements, into)
  return [...into]
}
