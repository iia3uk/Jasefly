import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useQuery } from '@tanstack/react-query'
import { FolderPlus, ImagePlus, Trash2, Upload, X } from 'lucide-react'
import { endpoints, mediaUrl } from '@/lib/api'
import type { ID, MediaAsset } from '@/types'
import { Button, GlassPanel, Skeleton } from '@/components/ui'
import { t } from '@/admin/i18n'

type FolderFilter = 'all' | 'root' | ID

type Props = {
  value?: ID | null
  onChange: (id: ID | null, asset?: MediaAsset | null) => void
  label?: string
  onPickMany?: (ids: ID[], assets?: MediaAsset[]) => void
  multiple?: boolean
  defaultOpen?: boolean
  onClose?: () => void
  triggerless?: boolean
  /** Filter library + upload accept: images, videos, or all. */
  kind?: 'image' | 'video' | 'all'
}

export function MediaPicker({
  value,
  onChange,
  label = 'Медиа',
  onPickMany,
  multiple = false,
  defaultOpen = false,
  onClose,
  triggerless = false,
  kind = 'all',
}: Props) {
  const [open, setOpen] = useState(defaultOpen)
  const [query, setQuery] = useState('')
  const [folder, setFolder] = useState<FolderFilter>('all')
  const [error, setError] = useState('')
  const [uploading, setUploading] = useState(false)
  const [selected, setSelected] = useState<ID[]>([])
  const input = useRef<HTMLInputElement>(null)
  const scrollY = useRef(0)

  const foldersQuery = useQuery({
    queryKey: ['admin', 'media-folders'],
    queryFn: endpoints.mediaFolders,
    enabled: open,
  })
  const mediaQuery = useQuery({
    queryKey: ['admin', 'media', folder, query],
    queryFn: () => endpoints.mediaList({
      folder_id: folder === 'all' ? undefined : folder,
      q: query.trim() || undefined,
    }),
    enabled: open,
  })

  const folders = foldersQuery.data ?? []
  const media = useMemo(() => {
    const list = mediaQuery.data ?? []
    if (kind === 'image') {
      return list.filter((m) => {
        const mime = String(m.mime_type || '')
        return mime.startsWith('image/') || mime === 'application/pdf' || (!mime && !String(m.original_name || '').match(/\.(mp4|webm|ogg)$/i))
      })
    }
    if (kind === 'video') {
      return list.filter((m) => {
        const mime = String(m.mime_type || '')
        const name = String(m.original_name || m.filename || '')
        return mime.startsWith('video/') || /\.(mp4|webm|ogg|ogv)$/i.test(name)
      })
    }
    return list
  }, [mediaQuery.data, kind])
  const previewAsset = useMemo(
    () => media.find((item) => String(item.id) === String(value)),
    [media, value],
  )
  const previewSrc = previewAsset && !previewAsset.missing
    ? mediaUrl(previewAsset)
    : value != null && value !== ''
      ? mediaUrl(value)
      : undefined
  const hasValue = value != null && value !== ''
  const uploadFolderId = folder === 'all' || folder === 'root' ? null : folder
  const missingCount = media.filter((m) => m.missing).length

  const close = () => {
    setOpen(false)
    onClose?.()
  }

  useEffect(() => {
    if (!open) {
      setSelected([])
      setError('')
      return
    }
    scrollY.current = window.scrollY
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
      window.scrollTo(0, scrollY.current)
    }
  }, [open])

  const uploadFiles = async (files: FileList | File[] | null) => {
    const list = files ? Array.from(files) : []
    if (!list.length) return
    setUploading(true)
    setError('')
    try {
      const uploaded: MediaAsset[] = []
      for (const file of list) {
        uploaded.push(await endpoints.uploadMedia(file, { folder_id: uploadFolderId }))
      }
      await mediaQuery.refetch()
      await foldersQuery.refetch()
      if (multiple || onPickMany) {
        const ids = uploaded.map((x) => x.id)
        setSelected((prev) => [...prev, ...ids])
      } else if (uploaded[0]) {
        onChange(uploaded[0].id, uploaded[0])
        close()
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : t.uploadFailed)
    } finally {
      setUploading(false)
      if (input.current) input.current.value = ''
    }
  }

  const createFolder = async () => {
    const name = window.prompt(t.folderNamePrompt)
    if (!name?.trim()) return
    try {
      const created = await endpoints.createMediaFolder(name.trim())
      await foldersQuery.refetch()
      setFolder(created.id)
    } catch (e) {
      setError(e instanceof Error ? e.message : t.folderCreateFail)
    }
  }

  const deleteAsset = async (item: MediaAsset, e: React.SyntheticEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const ok = window.confirm(t.deleteMediaHostConfirm || 'Удалить файл с хостинга?')
    if (!ok) return
    try {
      await endpoints.deleteMedia(item.id)
      if (String(value) === String(item.id)) onChange(null, null)
      setSelected((prev) => prev.filter((id) => String(id) !== String(item.id)))
      await mediaQuery.refetch()
    } catch (err) {
      const message = err instanceof Error ? err.message : t.deleteMediaFail
      setError(message)
      window.alert(message)
    }
  }

  const purgeMissing = async () => {
    if (!missingCount) return
    if (!confirm(t.purgeMissingConfirm.replace('{n}', String(missingCount)))) return
    try {
      const result = await endpoints.purgeMissingMedia()
      setError('')
      await mediaQuery.refetch()
      window.alert(t.purgeMissingDone.replace('{n}', String(result.removed ?? missingCount)))
    } catch (err) {
      setError(err instanceof Error ? err.message : t.purgeMissingFail)
    }
  }

  const confirmMulti = () => {
    if (!selected.length) return
    const assets = selected
      .map((id) => media.find((m) => String(m.id) === String(id)))
      .filter((m): m is MediaAsset => Boolean(m))
    onPickMany?.(selected, assets)
    if (!onPickMany && selected[0] != null) {
      const first = assets[0] ?? media.find((m) => String(m.id) === String(selected[0]))
      onChange(selected[0], first ?? null)
    }
    close()
  }

  const toggleSelect = (item: MediaAsset) => {
    if (item.missing) {
      setError(t.mediaMissingHint)
      return
    }
    if (multiple || onPickMany) {
      setSelected((prev) =>
        prev.some((x) => String(x) === String(item.id))
          ? prev.filter((x) => String(x) !== String(item.id))
          : [...prev, item.id],
      )
      return
    }
    onChange(item.id, item)
    close()
  }

  const openPicker = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setOpen(true)
  }

  const modal = open
    ? createPortal(
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-3 sm:p-6"
          role="dialog"
          aria-modal="true"
          aria-label={t.mediaLibrary}
          onClick={close}
          onWheel={(e) => e.stopPropagation()}
        >
          <GlassPanel
            className="flex max-h-[min(92vh,880px)] w-full max-w-5xl flex-col overflow-hidden p-4 sm:p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-heading text-xl">{t.mediaLibrary}</h2>
              <Button type="button" onClick={close} className="px-2"><X size={18} /></Button>
            </div>

            <div className="mt-4 flex min-h-0 flex-1 flex-col gap-3 lg:flex-row">
              <aside className="flex shrink-0 flex-row gap-1 overflow-x-auto lg:w-48 lg:flex-col lg:overflow-visible">
                {[
                  { id: 'all' as const, label: t.folderAll },
                  { id: 'root' as const, label: t.folderRoot },
                  ...folders.map((f) => ({ id: f.id as FolderFilter, label: f.name })),
                ].map((item) => (
                  <button
                    key={String(item.id)}
                    type="button"
                    onClick={() => setFolder(item.id)}
                    className={`shrink-0 rounded-lg px-3 py-2 text-left text-sm transition ${
                      String(folder) === String(item.id) ? 'bg-white/10 text-white' : 'text-zinc-400 hover:bg-white/5 hover:text-white'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={createFolder}
                  className="inline-flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm text-zinc-400 hover:bg-white/5 hover:text-white"
                >
                  <FolderPlus size={15} /> {t.newFolder}
                </button>
              </aside>

              <div className="flex min-h-0 min-w-0 flex-1 flex-col">
                <div className="flex flex-wrap gap-2">
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder={t.searchMedia}
                    className="min-w-0 flex-1"
                  />
                  <input
                    ref={input}
                    className="hidden"
                    type="file"
                    accept={
                      kind === 'video'
                        ? 'video/mp4,video/webm'
                        : kind === 'image'
                          ? 'image/*,application/pdf'
                          : 'image/*,application/pdf,video/mp4,video/webm'
                    }
                    multiple
                    onChange={(e) => uploadFiles(e.target.files)}
                  />
                  <Button type="button" disabled={uploading} onClick={() => input.current?.click()}>
                    <Upload size={16} />{uploading ? t.uploading : t.upload}
                  </Button>
                  {missingCount > 0 && (
                    <Button type="button" className="text-amber-200" onClick={purgeMissing}>
                      {t.purgeMissing} ({missingCount})
                    </Button>
                  )}
                  {hasValue && !multiple && !onPickMany && (
                    <Button type="button" className="border border-white/15 bg-transparent text-zinc-300" onClick={() => { onChange(null, null); close() }}>
                      {t.clearMedia}
                    </Button>
                  )}
                  {(multiple || onPickMany) && (
                    <Button type="button" disabled={!selected.length} onClick={confirmMulti}>
                      {t.addSelected} ({selected.length})
                    </Button>
                  )}
                </div>
                <p className="mt-2 text-xs text-zinc-500">
                  {folder === 'all'
                    ? t.folderUploadHintAll
                    : folder === 'root'
                      ? t.folderUploadHintRoot
                      : t.folderUploadHintFolder}
                </p>
                {error && <p className="mt-2 text-sm text-red-400">{error}</p>}

                <div className="mt-4 min-h-0 flex-1 overflow-y-auto">
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                    {mediaQuery.isLoading
                      ? Array.from({ length: 8 }, (_, i) => <Skeleton key={i} className="aspect-square" />)
                      : media.map((item) => {
                          const active = (multiple || onPickMany)
                            ? selected.some((x) => String(x) === String(item.id))
                            : String(item.id) === String(value)
                          return (
                            <div
                              key={String(item.id)}
                              className={`relative overflow-hidden rounded-lg border text-left ${
                                item.missing
                                  ? 'border-amber-500/50 opacity-80'
                                  : active
                                    ? 'border-cyan-400'
                                    : 'border-white/10'
                              }`}
                            >
                              <button
                                type="button"
                                title={t.deleteMediaHost}
                                className="absolute top-1.5 right-1.5 z-30 inline-flex h-8 w-8 items-center justify-center rounded-md border border-white/20 bg-black/80 text-red-300 shadow-lg transition hover:bg-red-500/30 hover:text-red-100"
                                onPointerDown={(e) => {
                                  e.preventDefault()
                                  e.stopPropagation()
                                }}
                                onClick={(e) => deleteAsset(item, e)}
                              >
                                <Trash2 size={14} />
                              </button>
                              <button
                                type="button"
                                className="block w-full text-left"
                                onClick={() => toggleSelect(item)}
                              >
                                {item.missing ? (
                                  <div className="flex aspect-square items-center justify-center bg-amber-500/10 p-3 text-center text-xs text-amber-200">
                                    {t.mediaMissingBadge}
                                  </div>
                                ) : mediaUrl(item) ? (
                                  String(item.mime_type || '').startsWith('video/') ? (
                                    <div className="relative aspect-square bg-black/40">
                                      <video
                                        src={mediaUrl(item)}
                                        className="h-full w-full object-cover"
                                        muted
                                        playsInline
                                        preload="metadata"
                                      />
                                      <span className="absolute bottom-1 left-1 rounded bg-black/75 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-white">
                                        video
                                      </span>
                                    </div>
                                  ) : (
                                    <img
                                      src={mediaUrl(item)}
                                      alt={item.alt_text ?? ''}
                                      className="aspect-square w-full bg-white/5 object-cover"
                                      loading="lazy"
                                      onError={(e) => {
                                        e.currentTarget.style.display = 'none'
                                        const fallback = e.currentTarget.nextElementSibling as HTMLElement | null
                                        if (fallback?.dataset.fallback) fallback.hidden = false
                                      }}
                                    />
                                  )
                                ) : null}
                                <div hidden data-fallback="1" className="flex aspect-square items-center justify-center bg-amber-500/10 p-3 text-center text-xs text-amber-200">
                                  {t.mediaMissingBadge}
                                </div>
                                <span className="block truncate p-2 pr-10 text-xs">{item.original_name ?? item.filename}</span>
                              </button>
                            </div>
                          )
                        })}
                  </div>
                  {!mediaQuery.isLoading && !media.length && (
                    <p className="py-10 text-center text-sm text-zinc-500">{t.folderEmpty}</p>
                  )}
                </div>
              </div>
            </div>
          </GlassPanel>
        </div>,
        document.body,
      )
    : null

  return (
    <div>
      {!triggerless && (
        <>
          {!!label && <p className="mb-2 text-sm text-zinc-300">{label}</p>}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={openPicker}
              className="flex min-h-24 min-w-0 flex-1 items-center gap-3 rounded-xl border border-dashed border-white/15 p-3 text-left transition hover:border-white/35"
            >
              {previewSrc ? (
                <img className="h-16 w-16 shrink-0 rounded-lg object-cover" src={previewSrc} alt={previewAsset?.alt_text ?? ''} />
              ) : (
                <ImagePlus className="shrink-0 text-zinc-500" />
              )}
              <span className="truncate text-sm text-zinc-400">
                {previewAsset
                  ? (previewAsset.original_name ?? previewAsset.filename)
                  : hasValue
                    ? `#${value}`
                    : multiple || onPickMany
                      ? t.chooseMediaMany
                      : t.chooseMedia}
              </span>
            </button>
            {hasValue && !multiple && !onPickMany && (
              <button
                type="button"
                onClick={() => onChange(null)}
                className="inline-flex shrink-0 flex-col items-center justify-center gap-1 rounded-xl border border-white/10 px-3 text-xs text-zinc-400 transition hover:border-red-400/40 hover:bg-red-500/10 hover:text-red-300"
                title={t.clearMedia}
              >
                <X size={16} />
                {t.clearMedia}
              </button>
            )}
          </div>
        </>
      )}
      {modal}
    </div>
  )
}
