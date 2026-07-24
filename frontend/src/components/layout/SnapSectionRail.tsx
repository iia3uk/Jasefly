/**
 * ChatGPT-style section rail.
 * Stable active index (no flicker); fixed-width bars (no width jump).
 */
import { useEffect, useRef, useState } from 'react'
import clsx from 'clsx'
import { getSnapController } from '@/builder/lib/snapPageController'

type SnapTarget = { el: HTMLElement; label: string }

function topInScroller(el: HTMLElement, scroller: HTMLElement): number {
  return el.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop
}

function collectTargets(scroller: HTMLElement): SnapTarget[] {
  const nodes = scroller.querySelectorAll<HTMLElement>('.cms-snap-section, .cms-snap-footer')
  return Array.from(nodes).map((el, i) => {
    const heading = el.querySelector('h1, h2, h3')
    const label = heading?.textContent?.trim()
      || (el.classList.contains('cms-snap-footer') ? 'Подвал' : `Секция ${i + 1}`)
    return { el, label: label.slice(0, 48) }
  })
}

/** Which section owns the upper third of the viewport — with hysteresis. */
function pickActive(scroller: HTMLElement, targets: SnapTarget[], prev: number): number {
  if (!targets.length) return 0
  const marker = scroller.scrollTop + scroller.clientHeight * 0.28
  let best = 0
  let bestDist = Infinity
  for (let i = 0; i < targets.length; i++) {
    const top = topInScroller(targets[i].el, scroller)
    const dist = Math.abs(top - scroller.scrollTop)
    // Prefer section whose top is at/above the marker
    const score = top <= marker + 8 ? marker - top : top - marker + 50_000
    const use = Math.min(dist + score * 0.001, score)
    if (use < bestDist) {
      bestDist = use
      best = i
    }
  }
  // Hysteresis: ignore tiny flips to neighbour while barely past boundary
  if (best !== prev && prev >= 0 && prev < targets.length) {
    const prevTop = topInScroller(targets[prev].el, scroller)
    const bestTop = topInScroller(targets[best].el, scroller)
    const mid = (prevTop + bestTop) / 2
    const band = scroller.clientHeight * 0.12
    if (Math.abs(scroller.scrollTop - mid) < band) return prev
  }
  return best
}

export function SnapSectionRail() {
  const [visible, setVisible] = useState(false)
  const [targets, setTargets] = useState<SnapTarget[]>([])
  const [active, setActive] = useState(0)
  const [open, setOpen] = useState(false)
  const activeRef = useRef(0)
  const targetsRef = useRef<SnapTarget[]>([])

  useEffect(() => {
    const root = document.documentElement
    const scroller = document.getElementById('cms-snap-scroller')
    if (!scroller) return

    let raf = 0
    const rebuild = () => {
      const on = root.classList.contains('cms-snap-paging') || root.classList.contains('cms-snap-proximity')
      setVisible(on)
      if (!on) {
        targetsRef.current = []
        setTargets([])
        return
      }
      const list = collectTargets(scroller)
      targetsRef.current = list
      setTargets(list)
      const next = pickActive(scroller, list, activeRef.current)
      activeRef.current = next
      setActive(next)
    }

    const onScroll = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        const list = targetsRef.current
        if (!list.length) return
        const next = pickActive(scroller, list, activeRef.current)
        if (next === activeRef.current) return
        activeRef.current = next
        setActive(next)
      })
    }

    rebuild()
    const mo = new MutationObserver(rebuild)
    mo.observe(root, { attributes: true, attributeFilter: ['class'] })
    scroller.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', rebuild)
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(rebuild) : null
    ro?.observe(scroller)

    return () => {
      mo.disconnect()
      ro?.disconnect()
      scroller.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', rebuild)
      cancelAnimationFrame(raf)
    }
  }, [])

  if (!visible || targets.length < 2) return null

  const go = (i: number) => {
    const scroller = document.getElementById('cms-snap-scroller')
    const ctrl = getSnapController(scroller)
    activeRef.current = i
    setActive(i)
    if (ctrl) {
      ctrl.goTo(i)
      return
    }
    const t = targets[i]
    if (!t || !scroller) return
    const top = topInScroller(t.el, scroller)
    scroller.scrollTo({ top, behavior: 'smooth' })
  }

  return (
    <nav
      aria-label="Секции страницы"
      className={clsx('cms-snap-rail', open && 'cms-snap-rail--open')}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setOpen(false)
      }}
    >
      <div className="cms-snap-rail__track">
        {targets.map((t, i) => (
          <button
            key={`${t.label}-${i}`}
            type="button"
            className={clsx('cms-snap-rail__bar', i === active && 'is-active')}
            aria-label={t.label}
            aria-current={i === active ? 'true' : undefined}
            title={t.label}
            onClick={() => go(i)}
          >
            <span className="cms-snap-rail__mark" />
            <span className="cms-snap-rail__label">{t.label}</span>
          </button>
        ))}
      </div>
    </nav>
  )
}
