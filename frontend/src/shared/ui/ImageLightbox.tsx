import { useEffect, useId } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { cn } from '@/lib/cn'

type Props = {
  src: string
  alt?: string
  open: boolean
  onClose: () => void
}

/** Full-viewport image preview: close via X, backdrop, or Escape. No zoom controls. */
export function ImageLightbox({ src, alt = '', open, onClose }: Props) {
  const titleId = useId()

  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener('keydown', onKey)
    }
  }, [open, onClose])

  if (!open || typeof document === 'undefined') return null

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/90 p-3 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onClick={onClose}
    >
      <span id={titleId} className="sr-only">
        {alt || 'Просмотр изображения'}
      </span>
      <button
        type="button"
        aria-label="Закрыть"
        className={cn(
          'absolute right-3 top-3 z-10 grid h-11 w-11 place-items-center rounded-full',
          'border border-white/20 bg-black/50 text-white transition hover:bg-black/80 sm:right-5 sm:top-5',
        )}
        onClick={(e) => {
          e.stopPropagation()
          onClose()
        }}
      >
        <X size={22} strokeWidth={2} />
      </button>
      <img
        src={src}
        alt={alt}
        className="max-h-[min(96vh,100%)] max-w-[min(96vw,100%)] object-contain shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        draggable={false}
      />
    </div>,
    document.body,
  )
}
