import { useCallback, useEffect, useEffectEvent, useMemo, useState, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  ChevronLeft,
  ChevronRight,
  Download,
  Expand,
  ExternalLink,
  Film,
  Pause,
  Play,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react'
import { isVideoFileUrl, isVideoMime, resolveVideoUrl, type VideoPlatform } from '@/builder/lib/videoEmbed'
import { mediaUrl } from '@/lib/api'
import type { ProjectMediaItem } from '@/types'
import { cn } from '@/lib/cn'

type Props = {
  items: ProjectMediaItem[]
  title?: string
  autoplayMs?: number
  className?: string
}

type SlideKind = 'image' | 'video'

type ResolvedSlide = {
  item: ProjectMediaItem
  kind: SlideKind
  /** image URL, video file URL, or iframe embed URL */
  src: string
  /** thumbnail for strip / stage preview */
  thumbSrc: string
  mode: 'image' | 'file' | 'iframe'
  platform?: VideoPlatform
}

function itemKey(item: ProjectMediaItem, index: number) {
  return String(item.media_id ?? item.url ?? item.id ?? index)
}

function itemAlt(item: ProjectMediaItem, title: string, index: number) {
  return item.caption || item.alt_text || `${title} ${index + 1}`
}

function youtubeThumb(embedSrc: string): string | null {
  const id = embedSrc.match(/\/embed\/([^/?#]+)/)?.[1]
  return id ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : null
}

/** Prefer playable youtube.com embed. Never force autoplay — YT blocks unmuted autoplay → black frame. */
function playbackEmbedSrc(src: string): string {
  try {
    const u = new URL(src)
    if (u.hostname.includes('youtube-nocookie.com')) {
      u.hostname = 'www.youtube.com'
    }
    u.searchParams.delete('autoplay')
    u.searchParams.set('rel', '0')
    u.searchParams.set('playsinline', '1')
    return u.href
  } catch {
    return src
  }
}

/**
 * Responsive 16:9 YouTube/embed box.
 * Explicit width is required in flex/lightbox — % width + padding-top collapses to 0 → black screen.
 */
function VideoEmbedFrame({
  src,
  title,
  className,
  wide,
}: {
  src: string
  title: string
  className?: string
  /** lightbox: fill available width up to 1100px */
  wide?: boolean
}) {
  return (
    <div
      className={cn('bg-black', className)}
      style={{
        width: wide ? 'min(96vw, 1100px)' : '100%',
        maxWidth: '100%',
      }}
    >
      <div
        style={{
          position: 'relative',
          width: '100%',
          height: 0,
          paddingTop: '56.25%',
          overflow: 'hidden',
          background: '#000',
        }}
      >
        <iframe
          src={playbackEmbedSrc(src)}
          title={title}
          allowFullScreen
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
          referrerPolicy="strict-origin-when-cross-origin"
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            maxHeight: 'none',
            border: 0,
            display: 'block',
          }}
        />
      </div>
    </div>
  )
}

function resolveSlide(item: ProjectMediaItem): ResolvedSlide | null {
  const fileSrc = mediaUrl(item.media_id as never)
  const embed = resolveVideoUrl(String(item.url || ''))
  const mime = String(item.media_mime || item.mime_type || '')
  const nameHint = String(item.original_name || item.filename || '')
  const fileIsVideo =
    isVideoMime(mime) ||
    isVideoFileUrl(fileSrc) ||
    isVideoFileUrl(nameHint)

  if (embed.kind === 'iframe') {
    const thumb = embed.platform === 'youtube' ? youtubeThumb(embed.src) : null
    return {
      item,
      kind: 'video',
      mode: 'iframe',
      src: embed.src,
      thumbSrc: thumb || '',
      platform: embed.platform,
    }
  }
  if (embed.kind === 'file') {
    return {
      item,
      kind: 'video',
      mode: 'file',
      src: embed.src,
      thumbSrc: embed.src,
      platform: 'file',
    }
  }
  if (fileSrc && fileIsVideo) {
    return {
      item,
      kind: 'video',
      mode: 'file',
      src: fileSrc,
      thumbSrc: fileSrc,
      platform: 'file',
    }
  }
  if (fileSrc) {
    return {
      item,
      kind: 'image',
      mode: 'image',
      src: fileSrc,
      thumbSrc: fileSrc,
    }
  }
  return null
}

function SlideThumb({ slide, className }: { slide: ResolvedSlide; className?: string }) {
  if (slide.kind === 'image' && slide.thumbSrc) {
    return <img src={slide.thumbSrc} alt="" className={cn('h-full w-full object-cover', className)} loading="lazy" decoding="async" />
  }
  if (slide.mode === 'file' && slide.thumbSrc) {
    return (
      <span className="relative block h-full w-full bg-black/50">
        <video src={slide.thumbSrc} className="h-full w-full object-cover" muted playsInline preload="metadata" />
        <Film size={12} className="pointer-events-none absolute bottom-1 right-1 text-white drop-shadow" />
      </span>
    )
  }
  if (slide.thumbSrc) {
    return (
      <span className="relative block h-full w-full bg-black/50">
        <img src={slide.thumbSrc} alt="" className="h-full w-full object-cover" loading="lazy" />
        <Film size={12} className="pointer-events-none absolute bottom-1 right-1 text-white drop-shadow" />
      </span>
    )
  }
  return (
    <span className="flex h-full w-full items-center justify-center bg-black/55 text-white/80">
      <Film size={18} />
    </span>
  )
}

function StageMedia({ slide, title, index }: { slide: ResolvedSlide; title: string; index: number }) {
  if (slide.kind === 'image') {
    return (
      <img
        src={slide.src}
        alt={itemAlt(slide.item, title, index)}
        className="h-full w-full object-cover"
        loading="eager"
        decoding="async"
      />
    )
  }
  if (slide.mode === 'iframe') {
    return (
      <VideoEmbedFrame
        src={slide.src}
        title={itemAlt(slide.item, title, index)}
      />
    )
  }
  return (
    <video
      src={slide.src}
      className="h-full w-full object-contain bg-black"
      style={{ maxHeight: 'none' }}
      controls
      playsInline
      preload="metadata"
    />
  )
}

function ViewerMedia({ slide, title, index, zoom }: { slide: ResolvedSlide; title: string; index: number; zoom: number }) {
  if (slide.kind === 'video' && slide.mode === 'iframe') {
    return (
      <VideoEmbedFrame
        src={slide.src}
        title={itemAlt(slide.item, title, index)}
        className="rounded-lg shadow-2xl"
        wide
      />
    )
  }
  if (slide.kind === 'video' && slide.mode === 'file') {
    return (
      <video
        className="max-h-full max-w-full rounded-lg bg-black object-contain shadow-2xl"
        src={slide.src}
        controls
        playsInline
        preload="metadata"
      />
    )
  }
  return (
    <img
      src={slide.src}
      alt={itemAlt(slide.item, title, index)}
      className="max-h-full max-w-full object-contain transition-transform duration-200"
      style={{
        transform: `scale(${zoom})`,
        transformOrigin: 'center center',
      }}
      draggable={false}
    />
  )
}

export function ProjectGallery({ items, title = 'Галерея', autoplayMs = 4500, className }: Props) {
  const slides = useMemo(
    () => items.map(resolveSlide).filter((s): s is ResolvedSlide => s != null),
    [items],
  )
  const count = slides.length

  const [index, setIndex] = useState(0)
  const [playing, setPlaying] = useState(true)
  const [viewerOpen, setViewerOpen] = useState(false)
  const [viewerIndex, setViewerIndex] = useState(0)
  const [zoom, setZoom] = useState(1)
  /** YT iframe mounted while parent opacity:0 → permanent black; wait for overlay paint */
  const [viewerEmbedReady, setViewerEmbedReady] = useState(false)

  const go = useCallback((next: number) => {
    if (count <= 0) return
    setIndex(((next % count) + count) % count)
  }, [count])

  const goViewer = useCallback((next: number) => {
    if (count <= 0) return
    setViewerIndex(((next % count) + count) % count)
    setZoom(1)
  }, [count])

  const openViewer = (i: number) => {
    setViewerIndex(i)
    setZoom(1)
    setViewerEmbedReady(false)
    setViewerOpen(true)
    setPlaying(false)
  }

  const closeViewer = () => {
    setViewerOpen(false)
    setViewerEmbedReady(false)
    setZoom(1)
    setIndex(viewerIndex)
  }

  const onAutoplayTick = useEffectEvent(() => {
    go(index + 1)
  })

  const current = slides[index]
  const viewer = slides[viewerIndex]
  const viewerIsVideo = viewer?.kind === 'video'

  // Don't auto-advance while a video slide is active (user may watch inline preview).
  useEffect(() => {
    if (!playing || viewerOpen || count < 2) return
    if (current?.kind === 'video') return
    const id = window.setInterval(() => onAutoplayTick(), autoplayMs)
    return () => window.clearInterval(id)
  }, [playing, viewerOpen, count, autoplayMs, current?.kind])

  useEffect(() => {
    if (!viewerOpen) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [viewerOpen])

  // Mount embed only after lightbox is visible — avoids YT black frame on opacity:0 parent
  useEffect(() => {
    if (!viewerOpen) {
      setViewerEmbedReady(false)
      return
    }
    const slide = slides[viewerIndex]
    if (slide?.kind !== 'video') {
      setViewerEmbedReady(true)
      return
    }
    setViewerEmbedReady(false)
    const id = window.setTimeout(() => setViewerEmbedReady(true), 80)
    return () => window.clearTimeout(id)
  }, [viewerOpen, viewerIndex, slides])

  useEffect(() => {
    if (!viewerOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeViewer()
      if (e.key === 'ArrowLeft') goViewer(viewerIndex - 1)
      if (e.key === 'ArrowRight') goViewer(viewerIndex + 1)
      if (!viewerIsVideo) {
        if (e.key === '+' || e.key === '=') setZoom((z) => Math.min(3, Number((z + 0.25).toFixed(2))))
        if (e.key === '-') setZoom((z) => Math.max(1, Number((z - 0.25).toFixed(2))))
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [viewerOpen, viewerIndex, goViewer, viewerIsVideo])

  if (!count || !current) return null

  return (
    <div className={cn('mt-8 sm:mt-10', className)}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 className="font-heading text-xl font-semibold sm:text-2xl">{title}</h2>
        {count > 1 && (
          <div className="flex items-center gap-2 text-sm text-[var(--muted)]">
            <span>{index + 1} / {count}</span>
            <button
              type="button"
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/15 transition hover:border-white/35 hover:bg-white/[0.06]"
              aria-label={playing ? 'Пауза' : 'Автоперелистывание'}
              onClick={() => setPlaying((v) => !v)}
            >
              {playing ? <Pause size={15} /> : <Play size={15} />}
            </button>
          </div>
        )}
      </div>

      <div className="relative mt-4 overflow-hidden rounded-[calc(var(--radius)+4px)] border border-white/[0.06] bg-black/25 sm:mt-5">
        {current.kind === 'video' && current.mode === 'iframe' ? (
          <div className="relative">
            {viewerOpen ? (
              <div className="w-full bg-black" style={{ paddingTop: '56.25%' }} />
            ) : (
              <StageMedia slide={current} title={title} index={index} />
            )}
            {count > 1 && (
              <>
                <button
                  type="button"
                  className="absolute left-3 top-1/2 z-20 inline-flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-white/20 bg-black/45 text-white backdrop-blur transition hover:bg-black/65"
                  aria-label="Предыдущее"
                  onClick={(e) => { e.stopPropagation(); setPlaying(false); go(index - 1) }}
                >
                  <ChevronLeft size={20} />
                </button>
                <button
                  type="button"
                  className="absolute right-3 top-1/2 z-20 inline-flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-white/20 bg-black/45 text-white backdrop-blur transition hover:bg-black/65"
                  aria-label="Следующее"
                  onClick={(e) => { e.stopPropagation(); setPlaying(false); go(index + 1) }}
                >
                  <ChevronRight size={20} />
                </button>
              </>
            )}
            <button
              type="button"
              className="absolute bottom-3 right-3 z-20 inline-flex items-center gap-2 rounded-full border border-white/20 bg-black/55 px-3 py-2 text-xs text-white backdrop-blur transition hover:bg-black/75"
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                setPlaying(false)
                openViewer(index)
              }}
            >
              <Expand size={14} />
              Открыть
            </button>
          </div>
        ) : (
          <div className="relative aspect-[16/10] sm:aspect-[16/9]">
            <AnimatePresence mode="wait" initial={false}>
              {current.kind === 'video' ? (
                viewerOpen ? (
                  <div key="video-placeholder" className="absolute inset-0 bg-black" />
                ) : (
                  <div key={itemKey(current.item, index)} className="absolute inset-0 h-full w-full bg-black">
                    <StageMedia slide={current} title={title} index={index} />
                  </div>
                )
              ) : (
                <motion.button
                  type="button"
                  key={itemKey(current.item, index)}
                  initial={{ opacity: 0.35, scale: 1.02 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.99 }}
                  transition={{ duration: 0.35 }}
                  className="absolute inset-0 block h-full w-full cursor-zoom-in"
                  onClick={() => openViewer(index)}
                  aria-label="Открыть просмотр"
                >
                  <StageMedia slide={current} title={title} index={index} />
                </motion.button>
              )}
            </AnimatePresence>

            {count > 1 && (
              <>
                <button
                  type="button"
                  className="absolute left-3 top-1/2 z-20 inline-flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-white/20 bg-black/45 text-white backdrop-blur transition hover:bg-black/65"
                  aria-label="Предыдущее"
                  onClick={(e) => { e.stopPropagation(); setPlaying(false); go(index - 1) }}
                >
                  <ChevronLeft size={20} />
                </button>
                <button
                  type="button"
                  className="absolute right-3 top-1/2 z-20 inline-flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-white/20 bg-black/45 text-white backdrop-blur transition hover:bg-black/65"
                  aria-label="Следующее"
                  onClick={(e) => { e.stopPropagation(); setPlaying(false); go(index + 1) }}
                >
                  <ChevronRight size={20} />
                </button>
              </>
            )}

            <button
              type="button"
              className="absolute bottom-3 right-3 z-20 inline-flex items-center gap-2 rounded-full border border-white/20 bg-black/55 px-3 py-2 text-xs text-white backdrop-blur transition hover:bg-black/75"
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                setPlaying(false)
                openViewer(index)
              }}
            >
              <Expand size={14} />
              Открыть
            </button>

            {current.item.caption && (
              <p className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-4 pb-4 pt-10 text-sm text-white/90">
                {current.item.caption}
              </p>
            )}
          </div>
        )}

        {current.kind === 'video' && current.mode === 'iframe' && current.item.caption ? (
          <p className="border-t border-white/[0.06] px-4 py-2 text-sm text-[var(--muted)]">{current.item.caption}</p>
        ) : null}

        {count > 1 && (
          <div className="flex gap-2 overflow-x-auto border-t border-white/[0.06] p-3">
            {slides.map((slide, i) => (
              <button
                type="button"
                key={itemKey(slide.item, i)}
                onClick={() => { setPlaying(false); go(i) }}
                className={cn(
                  'relative h-16 w-24 shrink-0 overflow-hidden rounded-lg border transition sm:h-20 sm:w-28',
                  i === index ? 'border-[var(--accent)] ring-2 ring-[var(--accent)]/30' : 'border-white/10 opacity-70 hover:opacity-100',
                )}
                aria-label={`Слайд ${i + 1}`}
                aria-current={i === index}
              >
                <SlideThumb slide={slide} />
              </button>
            ))}
          </div>
        )}
      </div>

      <AnimatePresence>
        {viewerOpen && viewer && (
          <motion.div
            className="fixed inset-0 z-[120] flex flex-col bg-black/92 backdrop-blur-sm"
            // No fade-in for video: YT iframe mounted under opacity:0 stays black forever
            initial={viewerIsVideo ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            role="dialog"
            aria-modal="true"
            aria-label="Просмотр галереи"
          >
            <div className="flex items-center justify-between gap-3 border-b border-white/10 px-3 py-3 sm:px-5">
              <p className="text-sm text-white/80">
                {viewerIndex + 1} / {count}
                {viewer.item.caption ? <span className="ml-3 text-white/55">{viewer.item.caption}</span> : null}
                {viewer.kind === 'video' ? (
                  <span className="ml-3 inline-flex items-center gap-1 rounded-full bg-white/10 px-2 py-0.5 text-[10px] uppercase tracking-wide text-white/70">
                    <Film size={10} /> видео
                  </span>
                ) : null}
              </p>
              <div className="flex items-center gap-1.5 sm:gap-2">
                {!viewerIsVideo && (
                  <>
                    <ToolBtn label="Уменьшить" onClick={() => setZoom((z) => Math.max(1, Number((z - 0.25).toFixed(2))))} disabled={zoom <= 1}>
                      <ZoomOut size={18} />
                    </ToolBtn>
                    <ToolBtn label="Увеличить" onClick={() => setZoom((z) => Math.min(3, Number((z + 0.25).toFixed(2))))} disabled={zoom >= 3}>
                      <ZoomIn size={18} />
                    </ToolBtn>
                  </>
                )}
                {viewer.mode === 'iframe' ? (
                  <a
                    href={String(viewer.item.url || viewer.src)}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/15 text-white transition hover:bg-white/10"
                    aria-label="Открыть источник"
                  >
                    <ExternalLink size={18} />
                  </a>
                ) : (
                  <a
                    href={viewer.src}
                    download
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/15 text-white transition hover:bg-white/10"
                    aria-label="Скачать"
                  >
                    <Download size={18} />
                  </a>
                )}
                <ToolBtn label="Закрыть" onClick={closeViewer}>
                  <X size={18} />
                </ToolBtn>
              </div>
            </div>

            <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden p-3 sm:p-6">
              {count > 1 && (
                <>
                  <button
                    type="button"
                    className="absolute left-2 z-10 inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/20 bg-black/40 text-white transition hover:bg-black/60 sm:left-4"
                    aria-label="Предыдущее"
                    onClick={() => goViewer(viewerIndex - 1)}
                  >
                    <ChevronLeft size={22} />
                  </button>
                  <button
                    type="button"
                    className="absolute right-2 z-10 inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/20 bg-black/40 text-white transition hover:bg-black/60 sm:right-4"
                    aria-label="Следующее"
                    onClick={() => goViewer(viewerIndex + 1)}
                  >
                    <ChevronRight size={22} />
                  </button>
                </>
              )}

              {/* No opacity animation for video — YT iframe breaks when mounted at opacity:0 */}
              {viewer.kind === 'video' ? (
                <div
                  key={itemKey(viewer.item, viewerIndex)}
                  className="flex h-full w-full items-center justify-center"
                >
                  {viewerEmbedReady ? (
                    <ViewerMedia slide={viewer} title={title} index={viewerIndex} zoom={1} />
                  ) : (
                    <div
                      className="rounded-lg bg-black"
                      style={{ width: 'min(96vw, 1100px)', maxWidth: '100%', paddingTop: '56.25%' }}
                      aria-hidden
                    />
                  )}
                </div>
              ) : (
                <AnimatePresence mode="wait" initial={false}>
                  <motion.div
                    key={itemKey(viewer.item, viewerIndex)}
                    className={cn(
                      'flex h-full w-full items-center justify-center',
                      // Fit at zoom 1 (no scroll). Allow pan only when zoomed in.
                      zoom > 1 ? 'overflow-auto' : 'overflow-hidden',
                    )}
                    initial={{ opacity: 0, scale: 0.98 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 1.01 }}
                    transition={{ duration: 0.2 }}
                    onClick={(e) => { if (e.target === e.currentTarget) closeViewer() }}
                  >
                    <ViewerMedia slide={viewer} title={title} index={viewerIndex} zoom={zoom} />
                  </motion.div>
                </AnimatePresence>
              )}
            </div>

            {count > 1 && (
              <div className="flex justify-center gap-2 overflow-x-auto border-t border-white/10 px-3 py-3">
                {slides.map((slide, i) => (
                  <button
                    type="button"
                    key={itemKey(slide.item, i)}
                    onClick={() => goViewer(i)}
                    className={cn(
                      'h-14 w-20 shrink-0 overflow-hidden rounded-md border transition',
                      i === viewerIndex ? 'border-white ring-2 ring-white/40' : 'border-white/15 opacity-60 hover:opacity-100',
                    )}
                    aria-label={`Слайд ${i + 1}`}
                  >
                    <SlideThumb slide={slide} />
                  </button>
                ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function ToolBtn({
  children,
  onClick,
  label,
  disabled,
}: {
  children: ReactNode
  onClick: () => void
  label: string
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/15 text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-35"
    >
      {children}
    </button>
  )
}
