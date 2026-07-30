import type { ReactNode } from 'react'
import { mediaUrl } from '@/lib/api'
import type { ID } from '@/types'
import { MediaPicker } from '@/admin/components/MediaPicker'
import { Button, GlassPanel } from '@/components/ui'
import { fieldLabel, t } from '@/admin/i18n'

type Data = Record<string, unknown>

const ANIMATION_OPTIONS: Array<{ value: string; label: string }> = [
  { value: '', label: 'Без анимации' },
  { value: 'fade-up', label: 'Появление снизу' },
  { value: 'fade-in', label: 'Плавное появление' },
  { value: 'slide-in', label: 'Выезд слева' },
  { value: 'zoom-in', label: 'Увеличение' },
]

const inputClass =
  'min-h-[50px] w-full rounded-xl border border-[#292d36] bg-[#0f141c] px-4 py-3 text-[#e8ebf2] shadow-none placeholder:text-[#666e7d] focus:border-[#25d9f4] focus:outline-none focus:ring-[3px] focus:ring-[rgba(37,217,244,0.12)]'

function FieldShell({
  label,
  htmlFor,
  children,
}: {
  label: string
  htmlFor?: string
  children: ReactNode
}) {
  return (
    <label htmlFor={htmlFor} className="block space-y-2">
      <span className="text-sm text-[#c7ccd6]">{label}</span>
      {children}
    </label>
  )
}

type Props = {
  form: Data
  set: (key: string, value: unknown) => void
  onSave: () => void
  saving?: boolean
  error?: string
  banner?: ReactNode
}

/**
 * Hero editor — card layout with a fixed (non-sticky) save bar at the top
 * so it never jumps while media/fields reflow.
 */
export function HeroEditor({ form, set, onSave, saving, error, banner }: Props) {
  const mediaId = (form.background_media_id as ID | null | undefined) ?? null

  const saveBar = (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-[#292d36] bg-[#111113] p-3">
      <Button
        type="button"
        disabled={saving}
        onClick={onSave}
        className="border-[#159bb7] bg-[#114d5b] text-[#eafbff] hover:border-[#25d9f4] hover:bg-[#176476]"
      >
        {saving ? t.saving : t.saveChanges}
      </Button>
      {error && <span className="text-sm text-red-400">{error}</span>}
    </div>
  )

  return (
    <div className="space-y-4">
      {banner}
      {saveBar}
      <GlassPanel className="border-[#292d36] bg-[#10141c] p-4 sm:p-5">
        <div className="grid gap-4 md:grid-cols-2">
          <FieldShell label={fieldLabel('headline')} htmlFor="hero-title">
            <input
              id="hero-title"
              className={inputClass}
              type="text"
              maxLength={150}
              placeholder="Введите заголовок"
              value={String(form.headline ?? '')}
              onChange={(e) => set('headline', e.target.value)}
            />
          </FieldShell>

          <FieldShell label={fieldLabel('subheadline')} htmlFor="hero-subtitle">
            <input
              id="hero-subtitle"
              className={inputClass}
              type="text"
              maxLength={255}
              placeholder="Введите подзаголовок"
              value={String(form.subheadline ?? '')}
              onChange={(e) => set('subheadline', e.target.value)}
            />
          </FieldShell>

          <FieldShell label={fieldLabel('badge_text')} htmlFor="hero-badge">
            <input
              id="hero-badge"
              className={inputClass}
              type="text"
              maxLength={80}
              placeholder="Например: Новинка"
              value={String(form.badge_text ?? '')}
              onChange={(e) => set('badge_text', e.target.value)}
            />
          </FieldShell>

          <FieldShell label={fieldLabel('animation_style')} htmlFor="hero-animation">
            <select
              id="hero-animation"
              className={`${inputClass} color-scheme-dark`}
              value={String(form.animation_style ?? '') === 'fade' ? 'fade-in' : String(form.animation_style ?? '')}
              onChange={(e) => set('animation_style', e.target.value)}
            >
              {ANIMATION_OPTIONS.map((opt) => (
                <option key={opt.value || 'none'} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </FieldShell>

          <FieldShell label={fieldLabel('primary_cta_label')} htmlFor="hero-primary-text">
            <input
              id="hero-primary-text"
              className={inputClass}
              type="text"
              maxLength={80}
              placeholder="Подробнее"
              value={String(form.primary_cta_label ?? '')}
              onChange={(e) => set('primary_cta_label', e.target.value)}
            />
          </FieldShell>

          <FieldShell label={fieldLabel('primary_cta_href')} htmlFor="hero-primary-url">
            <input
              id="hero-primary-url"
              className={inputClass}
              type="text"
              maxLength={500}
              placeholder="/projects"
              value={String(form.primary_cta_href ?? '')}
              onChange={(e) => set('primary_cta_href', e.target.value)}
            />
          </FieldShell>

          <FieldShell label={fieldLabel('secondary_cta_label')} htmlFor="hero-secondary-text">
            <input
              id="hero-secondary-text"
              className={inputClass}
              type="text"
              maxLength={80}
              placeholder="Связаться"
              value={String(form.secondary_cta_label ?? '')}
              onChange={(e) => set('secondary_cta_label', e.target.value)}
            />
          </FieldShell>

          <FieldShell label={fieldLabel('secondary_cta_href')} htmlFor="hero-secondary-url">
            <input
              id="hero-secondary-url"
              className={inputClass}
              type="text"
              maxLength={500}
              placeholder="/contact"
              value={String(form.secondary_cta_href ?? '')}
              onChange={(e) => set('secondary_cta_href', e.target.value)}
            />
          </FieldShell>

          <div className="md:col-span-2">
            <p className="mb-2 text-sm text-[#c7ccd6]">Фоновое изображение</p>
            <div className="hero-media-strip [&_button]:min-h-[96px] [&_button]:rounded-xl [&_button]:border-[#3a404c] [&_button]:bg-[#0f141c] [&_button:hover]:border-[#25d9f4] [&_button:hover]:bg-[#121923] [&_img]:h-[62px] [&_img]:w-[110px] [&_img]:rounded-lg">
              <MediaPicker
                label=""
                value={mediaId}
                onChange={(id) => {
                  set('background_media_id', id)
                  if (!id) set('background', null)
                }}
              />
            </div>
            <p className="mt-2 text-xs text-[#8d94a3]">
              JPG, PNG или WebP через медиатеку. Синхронизируется с Hero-блоком на главной (билдер).
              Превью:{' '}
              {mediaId != null ? (
                <a className="text-[#25d9f4] underline" href={mediaUrl(mediaId)} target="_blank" rel="noreferrer">
                  открыть файл
                </a>
              ) : (
                'не выбрано'
              )}
            </p>
          </div>

          <label className="flex items-center gap-2 text-sm text-[#c7ccd6] md:col-span-2">
            <input
              type="checkbox"
              checked={form.show_scroll_indicator === undefined || form.show_scroll_indicator === null
                ? true
                : Boolean(form.show_scroll_indicator)}
              onChange={(e) => set('show_scroll_indicator', e.target.checked)}
            />
            Показывать индикатор прокрутки
          </label>
        </div>
      </GlassPanel>
    </div>
  )
}
