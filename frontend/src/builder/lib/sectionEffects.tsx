import type { CSSProperties, ReactNode } from 'react'
import { useEffect } from 'react'
import clsx from 'clsx'
import { motion, useReducedMotion } from 'framer-motion'
import { attachSnapPageController } from '@/builder/lib/snapPageController'

export type ScrollSnapMode = 'none' | 'proximity' | 'mandatory'

export type SectionAnimation =
  | 'none'
  | 'fade-up'
  | 'fade'
  | 'scale-in'
  | 'slide-up'
  | 'blur-up'

export type SectionFx = {
  overlay?: string
  overlayOpacity?: number
  glow?: boolean
  glowPrimary?: string
  glowAccent?: string
  animation?: SectionAnimation
  minHeight?: string
  fullBleed?: boolean
  hideOnMobile?: boolean
  hideOnDesktop?: boolean
  contentMaxWidth?: string
  /** auto = follow page snap; off = exclude; start|center|end = force align */
  scrollSnap?: 'auto' | 'off' | 'start' | 'center' | 'end'
  snapStop?: 'normal' | 'always'
  /** Vertically center section content (nice for full-viewport pages). */
  vAlign?: 'start' | 'center' | 'end'
}

export type LayoutScrollMeta = {
  scrollSnap: ScrollSnapMode
  scrollSmooth: boolean
  /** Default min-height for snapped sections when section has no min_height. */
  snapHeight: string
}

const ANIMATIONS = new Set<SectionAnimation>([
  'none', 'fade-up', 'fade', 'scale-in', 'slide-up', 'blur-up',
])

export function readLayoutScrollMeta(meta: Record<string, unknown> | undefined | null): LayoutScrollMeta {
  const snap = String(meta?.scroll_snap || 'none')
  return {
    scrollSnap: snap === 'proximity' || snap === 'mandatory' ? snap : 'none',
    scrollSmooth: meta?.scroll_smooth !== false,
    snapHeight: String(meta?.snap_height || 'var(--cms-snap-vh, 100dvh)'),
  }
}

export function readSectionFx(settings: Record<string, unknown> | undefined): SectionFx {
  if (!settings) return {}
  const anim = String(settings.animation || 'none') as SectionAnimation
  const snap = String(settings.scroll_snap || 'auto')
  const vAlign = String(settings.v_align || 'start')
  return {
    overlay: settings.overlay ? String(settings.overlay) : undefined,
    overlayOpacity: settings.overlay_opacity != null ? Number(settings.overlay_opacity) : undefined,
    glow: settings.glow === true,
    glowPrimary: settings.glow_primary ? String(settings.glow_primary) : undefined,
    glowAccent: settings.glow_accent ? String(settings.glow_accent) : undefined,
    animation: ANIMATIONS.has(anim) ? anim : 'none',
    minHeight: settings.min_height ? String(settings.min_height) : undefined,
    fullBleed: settings.full_bleed === true,
    hideOnMobile: settings.hide_on_mobile === true,
    hideOnDesktop: settings.hide_on_desktop === true,
    contentMaxWidth: settings.content_max_width ? String(settings.content_max_width) : undefined,
    scrollSnap:
      snap === 'off' || snap === 'start' || snap === 'center' || snap === 'end'
        ? snap
        : 'auto',
    snapStop: settings.snap_stop === 'normal' ? 'normal' : 'always',
    vAlign: vAlign === 'center' || vAlign === 'end' ? vAlign : 'start',
  }
}

export function resolveSectionSnapAlign(
  fx: SectionFx,
  pageSnap: ScrollSnapMode,
): 'start' | 'center' | 'end' | null {
  if (pageSnap === 'none') {
    if (fx.scrollSnap === 'start' || fx.scrollSnap === 'center' || fx.scrollSnap === 'end') {
      return fx.scrollSnap
    }
    return null
  }
  if (fx.scrollSnap === 'off') return null
  if (fx.scrollSnap === 'start' || fx.scrollSnap === 'center' || fx.scrollSnap === 'end') {
    return fx.scrollSnap
  }
  return 'start'
}

export function sectionResponsiveClass(fx: SectionFx): string {
  return clsx(
    fx.hideOnMobile && 'max-md:!hidden',
    fx.hideOnDesktop && 'md:!hidden',
  )
}

export function sectionSnapClass(
  fx: SectionFx,
  pageSnap: ScrollSnapMode,
): string {
  const align = resolveSectionSnapAlign(fx, pageSnap)
  if (!align) return ''
  return clsx(
    'cms-snap-section',
    align === 'start' && 'cms-snap-align-start',
    align === 'center' && 'cms-snap-align-center',
    align === 'end' && 'cms-snap-align-end',
    (fx.snapStop ?? 'always') === 'always' && 'cms-snap-stop-always',
  )
}

export function sectionMinHeightStyle(
  fx: SectionFx,
  pageSnap: ScrollSnapMode,
  snapHeight: string,
): CSSProperties {
  if (fx.minHeight) return { minHeight: fx.minHeight }
  if (resolveSectionSnapAlign(fx, pageSnap) && snapHeight) {
    return { minHeight: snapHeight }
  }
  return {}
}

export function sectionVAlignClass(fx: SectionFx): string {
  if (fx.vAlign === 'center') return 'cms-section-valign-center'
  if (fx.vAlign === 'end') return 'cms-section-valign-end'
  return ''
}

/** Decorative overlay + optional dual radial glow (Framer-like atmosphere). */
export function SectionAtmosphere({ fx }: { fx: SectionFx }) {
  if (!fx.overlay && !fx.glow) return null
  const opacity = Number.isFinite(fx.overlayOpacity) ? fx.overlayOpacity! : 0.35
  const primary = fx.glowPrimary || 'var(--primary)'
  const accent = fx.glowAccent || 'var(--accent)'
  return (
    <>
      {fx.glow ? (
        <div
          className="pointer-events-none absolute inset-0 -z-10"
          aria-hidden
          style={{
            background: [
              `radial-gradient(ellipse 55% 60% at 22% 18%, color-mix(in srgb, ${primary} 22%, transparent) 0%, transparent 68%)`,
              `radial-gradient(ellipse 48% 52% at 78% 28%, color-mix(in srgb, ${accent} 14%, transparent) 0%, transparent 70%)`,
            ].join(','),
          }}
        />
      ) : null}
      {fx.overlay ? (
        <div
          className="pointer-events-none absolute inset-0 -z-10"
          aria-hidden
          style={{ background: fx.overlay, opacity }}
        />
      ) : null}
    </>
  )
}

const REVEAL_VARIANTS: Record<Exclude<SectionAnimation, 'none'>, {
  initial: Record<string, number | string>
  animate: Record<string, number | string>
}> = {
  'fade-up': {
    initial: { opacity: 0, y: 28 },
    animate: { opacity: 1, y: 0 },
  },
  fade: {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
  },
  'scale-in': {
    initial: { opacity: 0, scale: 0.94 },
    animate: { opacity: 1, scale: 1 },
  },
  'slide-up': {
    initial: { opacity: 0, y: 56 },
    animate: { opacity: 1, y: 0 },
  },
  'blur-up': {
    initial: { opacity: 0, y: 18, filter: 'blur(8px)' },
    animate: { opacity: 1, y: 0, filter: 'blur(0px)' },
  },
}

export function Reveal({
  animation,
  children,
  className,
  style,
  tag: Tag = 'div',
}: {
  animation?: SectionFx['animation']
  children: ReactNode
  className?: string
  style?: CSSProperties
  tag?: 'div' | 'section'
}) {
  const reduced = useReducedMotion()
  if (!animation || animation === 'none' || reduced) {
    const Comp = Tag
    return <Comp className={className} style={style}>{children}</Comp>
  }
  const variant = REVEAL_VARIANTS[animation]
  const MotionTag = Tag === 'section' ? motion.section : motion.div
  return (
    <MotionTag
      className={className}
      style={style}
      initial={variant.initial}
      whileInView={variant.animate}
      viewport={{ once: true, amount: 0.35 }}
      transition={{ duration: 0.65, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </MotionTag>
  )
}

/**
 * Page scroll-snap.
 * Public: snap on #cms-snap-scroller (header stays outside → sticky/nav OK).
 * Builder: snap on .builder-canvas-scroll.
 * Never put scroll-snap-type on <html> — that breaks position:sticky.
 */
export function useLayoutScrollSnap(
  meta: Record<string, unknown> | undefined | null,
  editMode?: boolean,
) {
  const scroll = readLayoutScrollMeta(meta)

  useEffect(() => {
    const mode = scroll.scrollSnap
    const smooth = scroll.scrollSmooth
    const root = document.documentElement

    root.classList.remove(
      'cms-scroll-snap-mandatory',
      'cms-scroll-snap-proximity',
      'cms-scroll-smooth',
      'cms-snap-paging',
      'cms-snap-proximity',
    )

    if (editMode) {
      const snapClass =
        mode === 'mandatory' ? 'cms-scroll-snap-mandatory'
          : mode === 'proximity' ? 'cms-scroll-snap-proximity'
            : null
      const smoothClass = smooth ? 'cms-scroll-smooth' : null
      const scroller = document.querySelector('.builder-canvas-scroll')
      if (!scroller || !snapClass) return
      const classes = [snapClass, smoothClass].filter(Boolean) as string[]
      scroller.classList.add(...classes)
      return () => {
        scroller.classList.remove('cms-scroll-snap-mandatory', 'cms-scroll-snap-proximity', 'cms-scroll-smooth')
      }
    }

    if (mode === 'none') return

    const header = document.querySelector('header')
    const measure = () => {
      const h = header instanceof HTMLElement ? header.getBoundingClientRect().height : 68
      root.style.setProperty('--cms-header-h', `${Math.round(h)}px`)
      const overlay = root.dataset.headerStyle === 'overlay'
      const snapVh = overlay
        ? 'calc(100dvh - var(--admin-bar-h, 0px))'
        : `calc(100dvh - ${Math.round(h)}px - var(--admin-bar-h, 0px))`
      root.style.setProperty('--cms-snap-vh', snapVh)
      root.style.setProperty('--cms-hero-vh', snapVh)
    }
    measure()
    root.classList.add(mode === 'mandatory' ? 'cms-snap-paging' : 'cms-snap-proximity')
    if (smooth) root.classList.add('cms-scroll-smooth')

    const scroller = document.getElementById('cms-snap-scroller')
    let controller: ReturnType<typeof attachSnapPageController> | null = null
    let attachTimer = 0

    const tryAttach = () => {
      if (!scroller || mode !== 'mandatory' || controller) return
      const n = scroller.querySelectorAll('.cms-snap-section, .cms-snap-footer').length
      if (n < 2) return
      controller = attachSnapPageController(scroller)
    }

    tryAttach()
    if (!controller && scroller && mode === 'mandatory') {
      // Sections may mount one frame later
      attachTimer = window.setTimeout(tryAttach, 0)
      requestAnimationFrame(() => tryAttach())
      window.setTimeout(tryAttach, 80)
      window.setTimeout(tryAttach, 250)
    }

    const ro = typeof ResizeObserver !== 'undefined' && header
      ? new ResizeObserver(measure)
      : null
    if (ro && header) ro.observe(header)
    window.addEventListener('resize', measure)

    return () => {
      window.clearTimeout(attachTimer)
      controller?.destroy()
      ro?.disconnect()
      window.removeEventListener('resize', measure)
      root.classList.remove('cms-snap-paging', 'cms-snap-proximity', 'cms-scroll-smooth')
      root.style.removeProperty('--cms-header-h')
      root.style.removeProperty('--cms-snap-vh')
      // Belt-and-suspenders: clear scroller inline styles if left from older controller
      const sc = document.getElementById('cms-snap-scroller')
      if (sc) {
        sc.style.removeProperty('overflow-y')
        sc.style.removeProperty('touch-action')
        sc.style.removeProperty('overscroll-behavior-y')
      }
    }
  }, [scroll.scrollSnap, scroll.scrollSmooth, editMode])

  return scroll
}
