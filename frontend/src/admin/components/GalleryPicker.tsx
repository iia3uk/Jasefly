import { useState } from 'react'
import { Film, ImagePlus, Trash2 } from 'lucide-react'
import { isVideoFileUrl, isVideoMime } from '@/builder/lib/videoEmbed'
import { mediaUrl } from '@/lib/api'
import type { ID, MediaAsset, ProjectMediaItem } from '@/types'
import { Button } from '@/components/ui'
import { MediaPicker } from '@/admin/components/MediaPicker'
import { t } from '@/admin/i18n'

type Props = {
  value?: ProjectMediaItem[]
  onChange: (items: ProjectMediaItem[]) => void
  label?: string
}

type PickerKind = 'image' | 'video' | null

export function GalleryPicker({ value = [], onChange, label = t.projectGallery }: Props) {
  const items = value ?? []
  const [pickerKind, setPickerKind] = useState<PickerKind>(null)
  const [videoUrlDraft, setVideoUrlDraft] = useState('')

  const addFromPicker = (ids: ID[], assets?: MediaAsset[], asVideo = false) => {
    const byId = new Map((assets ?? []).map((a) => [String(a.id), a]))
    const existing = new Set(items.map((x) => String(x.media_id)).filter((id) => id && id !== 'null' && id !== 'undefined'))
    const next = [...items]
    ids.forEach((id) => {
      if (existing.has(String(id))) return
      const asset = byId.get(String(id))
      const mime = asset?.mime_type ?? null
      next.push({
        media_id: id,
        url: null,
        media_type: asVideo || isVideoMime(mime) ? 'video' : 'gallery',
        media_mime: mime,
        mime_type: mime,
        original_name: asset?.original_name ?? null,
        sort_order: next.length,
        caption: '',
      })
    })
    onChange(next.map((item, i) => ({ ...item, sort_order: i })))
  }

  const addVideoUrl = () => {
    const url = videoUrlDraft.trim()
    if (!url) return
    onChange([
      ...items,
      {
        media_id: null,
        url,
        media_type: 'video',
        sort_order: items.length,
        caption: '',
      },
    ].map((item, i) => ({ ...item, sort_order: i })))
    setVideoUrlDraft('')
    setPickerKind(null)
  }

  const updateCaption = (index: number, caption: string) => {
    onChange(items.map((item, i) => (i === index ? { ...item, caption } : item)))
  }

  const updateUrl = (index: number, url: string) => {
    onChange(items.map((item, i) => (i === index ? { ...item, url } : item)))
  }

  const removeAt = (index: number) => {
    onChange(items.filter((_, i) => i !== index).map((item, i) => ({ ...item, sort_order: i })))
  }

  const move = (index: number, dir: -1 | 1) => {
    const target = index + dir
    if (target < 0 || target >= items.length) return
    const next = [...items]
    const [row] = next.splice(index, 1)
    next.splice(target, 0, row)
    onChange(next.map((item, i) => ({ ...item, sort_order: i })))
  }

  return (
    <div className="space-y-3 md:col-span-2">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-zinc-300">{label}</p>
          <p className="mt-1 text-xs text-zinc-500">
            Фото и видео на странице проекта. Видео — файл из медиатеки (MP4/WebM) или ссылка (YouTube / Rutube / VK / Vimeo).
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={() => setPickerKind('image')}>
            <ImagePlus size={16} /> Добавить изображение
          </Button>
          <Button type="button" className="border border-white/15 bg-transparent" onClick={() => setPickerKind('video')}>
            <Film size={16} /> Добавить видео
          </Button>
        </div>
      </div>

      {pickerKind === 'video' && (
        <div className="space-y-2 rounded-xl border border-white/10 bg-white/[0.02] p-3">
          <p className="text-xs text-zinc-400">Ссылка на видео (или выберите файл ниже)</p>
          <div className="flex flex-wrap gap-2">
            <input
              className="min-w-[16rem] flex-1 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm"
              placeholder="https://youtube.com/… или rutube / vk / vimeo / .mp4"
              value={videoUrlDraft}
              onChange={(e) => setVideoUrlDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  addVideoUrl()
                }
              }}
            />
            <Button type="button" disabled={!videoUrlDraft.trim()} onClick={addVideoUrl}>
              Добавить ссылку
            </Button>
            <Button type="button" className="border border-white/15 bg-transparent" onClick={() => setPickerKind(null)}>
              Отмена
            </Button>
          </div>
        </div>
      )}

      {pickerKind && (
        <MediaPicker
          value={null}
          onChange={() => {}}
          multiple
          triggerless
          defaultOpen
          kind={pickerKind}
          onPickMany={(ids, assets) => {
            addFromPicker(ids, assets, pickerKind === 'video')
            setPickerKind(null)
          }}
          onClose={() => setPickerKind(null)}
        />
      )}

      {!!items.length ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {items.map((item, index) => {
            const asVideo =
              Boolean(item.url) ||
              item.media_type === 'video' ||
              isVideoMime(item.media_mime || item.mime_type) ||
              isVideoFileUrl(item.original_name || undefined)
            const thumb = item.media_id != null ? mediaUrl(item.media_id) : undefined
            return (
              <div key={`${item.media_id ?? item.url ?? 'x'}-${index}`} className="flex gap-3 rounded-xl border border-white/10 p-3">
                {asVideo ? (
                  <span className="relative flex h-20 w-20 shrink-0 overflow-hidden rounded-lg bg-black/40">
                    {thumb ? (
                      <video src={thumb} className="h-full w-full object-cover" muted playsInline preload="metadata" />
                    ) : null}
                    <Film size={16} className="pointer-events-none absolute bottom-1 right-1 text-white drop-shadow" />
                  </span>
                ) : thumb ? (
                  <img
                    src={thumb}
                    alt={item.caption || item.alt_text || ''}
                    className="h-20 w-20 shrink-0 rounded-lg bg-white/5 object-cover"
                  />
                ) : (
                  <span className="flex h-20 w-20 shrink-0 items-center justify-center rounded-lg border border-dashed border-white/15 text-xs text-zinc-600">—</span>
                )}
                <div className="min-w-0 flex-1 space-y-2">
                  {item.url && !item.media_id ? (
                    <input
                      value={item.url}
                      onChange={(e) => updateUrl(index, e.target.value)}
                      placeholder="URL видео"
                      className="w-full truncate text-xs"
                    />
                  ) : (
                    <p className="truncate text-xs text-zinc-500">
                      {item.original_name || (item.media_id != null ? `#${item.media_id}` : item.url || 'Медиа')}
                      {asVideo ? ' · видео' : ''}
                    </p>
                  )}
                  <input
                    value={item.caption ?? ''}
                    onChange={(e) => updateCaption(index, e.target.value)}
                    placeholder={t.galleryCaption}
                    className="w-full"
                  />
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" className="px-2 text-xs" onClick={() => move(index, -1)} disabled={index === 0}>↑</Button>
                    <Button type="button" className="px-2 text-xs" onClick={() => move(index, 1)} disabled={index === items.length - 1}>↓</Button>
                    <Button type="button" className="px-2 text-red-300" onClick={() => removeAt(index)}>
                      <Trash2 size={14} />
                    </Button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <p className="text-sm text-zinc-500">{t.galleryEmpty}</p>
      )}
    </div>
  )
}
