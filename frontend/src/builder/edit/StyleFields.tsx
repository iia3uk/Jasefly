import { useState, type CSSProperties } from 'react'
import clsx from 'clsx'
import { ColorControl } from '@/builder/edit/ColorControl'
import { isCssGradient } from '@/builder/edit/colorUtils'
import {
  CUSTOM_FONT_VALUE,
  SYSTEM_FONT_OPTIONS,
  ensureFontCssValueLoaded,
  findGoogleFontPreset,
  presetsByCategory,
} from '@/builder/lib/googleFonts'

export type ElementStyles = {
  color?: string
  backgroundColor?: string
  backgroundImage?: string
  fontSize?: string
  fontWeight?: string
  fontFamily?: string
  textAlign?: string
  lineHeight?: string
  letterSpacing?: string
  padding?: string
  margin?: string
  borderRadius?: string
  maxWidth?: string
  width?: string
  height?: string
  opacity?: string
  objectFit?: string
}

export function readStyles(settings: Record<string, unknown> | undefined): ElementStyles {
  const raw = settings?.styles
  if (!raw || typeof raw !== 'object') return {}
  return raw as ElementStyles
}

/** Per-field styles: settings.fieldStyles[fieldKey] */
export function readFieldStyles(
  settings: Record<string, unknown> | undefined,
  field: string,
): ElementStyles {
  const bag = settings?.fieldStyles
  if (!bag || typeof bag !== 'object') return {}
  const raw = (bag as Record<string, unknown>)[field]
  if (!raw || typeof raw !== 'object') return {}
  return raw as ElementStyles
}

export function stylesToCss(styles: ElementStyles): CSSProperties {
  const out: CSSProperties = {}

  const textGrad = styles.color && isCssGradient(styles.color) ? styles.color : null
  const fillImage = styles.backgroundImage
    || (styles.backgroundColor && isCssGradient(styles.backgroundColor) ? styles.backgroundColor : undefined)
  const fillSolid = styles.backgroundColor && !isCssGradient(styles.backgroundColor)
    ? styles.backgroundColor
    : undefined

  if (textGrad) {
    // Gradient text via background-clip. Optional fill is a second background layer
    // clipped to the box so solid/gradient backgrounds still work.
    const layers = [textGrad]
    const clips = ['text']
    if (fillImage) {
      layers.push(fillImage)
      clips.push('border-box')
    } else if (fillSolid) {
      layers.push(`linear-gradient(${fillSolid}, ${fillSolid})`)
      clips.push('border-box')
    }
    out.backgroundImage = layers.join(', ')
    out.backgroundClip = clips.join(', ') as CSSProperties['backgroundClip']
    ;(out as CSSProperties & { WebkitBackgroundClip?: string }).WebkitBackgroundClip = clips.join(', ')
    out.color = 'transparent'
    ;(out as CSSProperties & { WebkitTextFillColor?: string }).WebkitTextFillColor = 'transparent'
  } else {
    if (styles.color) out.color = styles.color
    if (fillImage) out.backgroundImage = fillImage
    if (fillSolid) out.backgroundColor = fillSolid
  }

  if (styles.fontSize) out.fontSize = styles.fontSize
  if (styles.fontWeight) out.fontWeight = styles.fontWeight as CSSProperties['fontWeight']
  if (styles.fontFamily) out.fontFamily = styles.fontFamily
  if (styles.textAlign) out.textAlign = styles.textAlign as CSSProperties['textAlign']
  if (styles.lineHeight) out.lineHeight = styles.lineHeight
  if (styles.letterSpacing) out.letterSpacing = styles.letterSpacing
  if (styles.padding) out.padding = styles.padding
  if (styles.margin) out.margin = styles.margin
  if (styles.borderRadius) out.borderRadius = styles.borderRadius
  if (styles.maxWidth) out.maxWidth = styles.maxWidth
  if (styles.width) out.width = styles.width
  if (styles.height) out.height = styles.height
  if (styles.opacity) out.opacity = Number(styles.opacity) || undefined
  if (styles.objectFit) out.objectFit = styles.objectFit as CSSProperties['objectFit']
  return out
}

export function mergeStylePatch(
  settings: Record<string, unknown>,
  patch: Partial<ElementStyles>,
): Record<string, unknown> {
  const prev = readStyles(settings)
  return {
    ...settings,
    styles: { ...prev, ...patch },
  }
}

export function mergeFieldStylePatch(
  settings: Record<string, unknown>,
  field: string,
  patch: Partial<ElementStyles>,
): Record<string, unknown> {
  const prevBag = (settings.fieldStyles && typeof settings.fieldStyles === 'object')
    ? { ...(settings.fieldStyles as Record<string, ElementStyles>) }
    : {}
  const prev = readFieldStyles(settings, field)
  return {
    ...settings,
    fieldStyles: {
      ...prevBag,
      [field]: { ...prev, ...patch },
    },
  }
}

/** Align class helpers for field shells when textAlign is set on the field itself. */
export function fieldAlignClass(styles: ElementStyles): string {
  if (styles.textAlign === 'center') return 'mx-auto'
  if (styles.textAlign === 'right') return 'ml-auto'
  return ''
}

type StyleFieldsProps = {
  styles: ElementStyles
  onChange: (patch: Partial<ElementStyles>) => void
  /** text = typography; media = image/box; all = both */
  variant?: 'text' | 'media' | 'all'
  title?: string
}

function patchFill(onChange: (patch: Partial<ElementStyles>) => void, value: string) {
  if (!value) {
    onChange({ backgroundColor: '', backgroundImage: '' })
    return
  }
  if (isCssGradient(value)) {
    onChange({ backgroundImage: value, backgroundColor: '' })
    return
  }
  onChange({ backgroundColor: value, backgroundImage: '' })
}

function FontFamilyField({
  value,
  onChange,
}: {
  value: string
  onChange: (fontFamily: string) => void
}) {
  const preset = findGoogleFontPreset(value)
  const system = SYSTEM_FONT_OPTIONS.find((f) => f.value === value)
  const [customMode, setCustomMode] = useState(() => Boolean(value && !preset && !system))

  const selectValue = customMode
    ? CUSTOM_FONT_VALUE
    : !value
      ? ''
      : preset?.value || system?.value || CUSTOM_FONT_VALUE

  return (
    <div className="space-y-1.5">
      <label className="block space-y-1 text-xs text-zinc-400">
        Шрифт
        <select
          className="w-full"
          value={selectValue}
          onChange={(e) => {
            const v = e.target.value
            if (v === CUSTOM_FONT_VALUE) {
              setCustomMode(true)
              return
            }
            setCustomMode(false)
            onChange(v)
          }}
          style={preset && !customMode ? { fontFamily: preset.value } : undefined}
        >
          <option value="">По умолчанию (тема сайта)</option>
          <optgroup label="Системные">
            {SYSTEM_FONT_OPTIONS.map((f) => (
              <option key={f.value} value={f.value} style={{ fontFamily: f.value }}>
                {f.label}
              </option>
            ))}
          </optgroup>
          {presetsByCategory().map((group) => (
            <optgroup key={group.category} label={`Google · ${group.label}`}>
              {group.fonts.map((f) => (
                <option key={f.family} value={f.value} style={{ fontFamily: f.value }}>
                  {f.label}
                </option>
              ))}
            </optgroup>
          ))}
          <option value={CUSTOM_FONT_VALUE}>Свой (ввести вручную)…</option>
        </select>
      </label>
      {customMode && (
        <input
          className="w-full"
          placeholder='"My Font", sans-serif'
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </div>
  )
}

/** Align relative to the site column (full width), not a shrink-wrapped preview. */
export function StyleFields({ styles, onChange, variant = 'text', title = 'Стили' }: StyleFieldsProps) {
  const showText = variant === 'text' || variant === 'all'
  const showMedia = variant === 'media' || variant === 'all'
  const fillValue = styles.backgroundImage || styles.backgroundColor || ''

  return (
    <div className="space-y-3 border-t border-white/10 pt-4">
      <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-600">{title}</p>
      {showText && (
        <>
          <ColorControl
            label="Цвет текста"
            value={styles.color || ''}
            onChange={(color) => onChange({ color })}
            allowGradient
            gradientPreset="text"
            allowEmpty
            emptyHint="по умолчанию"
          />
          <ColorControl
            label="Фон"
            value={fillValue}
            onChange={(v) => patchFill(onChange, v)}
            allowGradient
            gradientPreset="fill"
            allowEmpty
            emptyHint="прозрачный"
          />
          <label className="block space-y-1 text-xs text-zinc-400">
            Размер шрифта
            <input className="w-full" placeholder="1rem / 24px" value={styles.fontSize || ''} onChange={(e) => onChange({ fontSize: e.target.value })} />
          </label>
          <label className="block space-y-1 text-xs text-zinc-400">
            Начертание
            <select className="w-full" value={styles.fontWeight || ''} onChange={(e) => onChange({ fontWeight: e.target.value })}>
              <option value="">По умолчанию</option>
              <option value="400">Regular</option>
              <option value="500">Medium</option>
              <option value="600">Semibold</option>
              <option value="700">Bold</option>
            </select>
          </label>
          <FontFamilyField
            value={styles.fontFamily || ''}
            onChange={(fontFamily) => {
              ensureFontCssValueLoaded(fontFamily)
              onChange({ fontFamily })
            }}
          />
          <div className="space-y-1.5">
            <p className="text-xs text-zinc-400">Выравнивание</p>
            <div className="grid grid-cols-4 gap-1">
              {([
                ['', 'Авто'],
                ['left', 'Слева'],
                ['center', 'Центр'],
                ['right', 'Справа'],
              ] as const).map(([value, label]) => (
                <button
                  key={value || 'auto'}
                  type="button"
                  className={clsx(
                    'rounded-md border px-1 py-2 text-[10px] transition',
                    (styles.textAlign || '') === value
                      ? 'border-[var(--accent,#8eb6ff)]/50 bg-[var(--accent,#8eb6ff)]/15 text-white'
                      : 'border-white/10 text-zinc-500 hover:border-white/20 hover:text-zinc-300',
                  )}
                  onClick={() => onChange({ textAlign: value })}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <label className="block space-y-1 text-xs text-zinc-400">
            Межстрочный интервал
            <input className="w-full" placeholder="1.5" value={styles.lineHeight || ''} onChange={(e) => onChange({ lineHeight: e.target.value })} />
          </label>
        </>
      )}
      {showMedia && (
        <>
          {!showText && (
            <ColorControl
              label="Фон"
              value={fillValue}
              onChange={(v) => patchFill(onChange, v)}
              allowGradient
              gradientPreset="fill"
              allowEmpty
              emptyHint="прозрачный"
            />
          )}
          <label className="block space-y-1 text-xs text-zinc-400">
            Ширина
            <input className="w-full" placeholder="100% / 320px" value={styles.width || ''} onChange={(e) => onChange({ width: e.target.value })} />
          </label>
          <label className="block space-y-1 text-xs text-zinc-400">
            Высота
            <input className="w-full" placeholder="auto / 240px" value={styles.height || ''} onChange={(e) => onChange({ height: e.target.value })} />
          </label>
          <label className="block space-y-1 text-xs text-zinc-400">
            Object-fit
            <select className="w-full" value={styles.objectFit || ''} onChange={(e) => onChange({ objectFit: e.target.value })}>
              <option value="">По умолчанию</option>
              <option value="cover">cover</option>
              <option value="contain">contain</option>
              <option value="fill">fill</option>
            </select>
          </label>
          <label className="block space-y-1 text-xs text-zinc-400">
            Прозрачность (0–1)
            <input className="w-full" placeholder="1" value={styles.opacity || ''} onChange={(e) => onChange({ opacity: e.target.value })} />
          </label>
        </>
      )}
      <label className="block space-y-1 text-xs text-zinc-400">
        Отступы (padding)
        <input className="w-full" placeholder="1rem 1.5rem" value={styles.padding || ''} onChange={(e) => onChange({ padding: e.target.value })} />
      </label>
      <label className="block space-y-1 text-xs text-zinc-400">
        Внешние отступы (margin)
        <input className="w-full" placeholder="0 0 1rem" value={styles.margin || ''} onChange={(e) => onChange({ margin: e.target.value })} />
      </label>
      <label className="block space-y-1 text-xs text-zinc-400">
        Скругление
        <input className="w-full" placeholder="8px" value={styles.borderRadius || ''} onChange={(e) => onChange({ borderRadius: e.target.value })} />
      </label>
      <label className="block space-y-1 text-xs text-zinc-400">
        Max-width
        <input className="w-full" placeholder="40rem" value={styles.maxWidth || ''} onChange={(e) => onChange({ maxWidth: e.target.value })} />
      </label>
    </div>
  )
}
