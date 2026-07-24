/**
 * Light snap helper for #cms-snap-scroller.
 * Does NOT hijack wheel — native scroll only.
 * go/goTo used by rail + keyboard for smooth section jumps.
 */

export type SnapPageController = {
  go: (dir: 1 | -1) => void
  goTo: (index: number) => void
  getIndex: () => number
  destroy: () => void
}

function listSections(scroller: HTMLElement): HTMLElement[] {
  return Array.from(
    scroller.querySelectorAll<HTMLElement>('.cms-snap-section, .cms-snap-footer'),
  )
}

function topInScroller(el: HTMLElement, scroller: HTMLElement): number {
  return el.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop
}

function nearestIndex(scroller: HTMLElement, sections: HTMLElement[]): number {
  const y = scroller.scrollTop
  let best = 0
  let bestDist = Infinity
  for (let i = 0; i < sections.length; i++) {
    const d = Math.abs(topInScroller(sections[i], scroller) - y)
    if (d < bestDist) {
      bestDist = d
      best = i
    }
  }
  return best
}

function clamp(i: number, len: number) {
  return Math.max(0, Math.min(len - 1, i))
}

function easeOutCubic(t: number) {
  return 1 - (1 - t) ** 3
}

function animateScroll(scroller: HTMLElement, to: number, ms: number): Promise<void> {
  const from = scroller.scrollTop
  if (ms <= 0 || Math.abs(from - to) < 1) {
    scroller.scrollTop = to
    return Promise.resolve()
  }
  const t0 = performance.now()
  return new Promise((resolve) => {
    let done = false
    const finish = () => {
      if (done) return
      done = true
      scroller.scrollTop = to
      resolve()
    }
    const frame = (now: number) => {
      if (done) return
      const t = Math.min(1, (now - t0) / ms)
      scroller.scrollTop = from + (to - from) * easeOutCubic(t)
      if (t < 1) requestAnimationFrame(frame)
      else finish()
    }
    requestAnimationFrame(frame)
  })
}

export function attachSnapPageController(scroller: HTMLElement): SnapPageController {
  let destroyed = false
  let token = 0

  const sections = () => listSections(scroller)

  const getIndex = () => {
    const list = sections()
    if (!list.length) return 0
    return nearestIndex(scroller, list)
  }

  const scrollToIndex = (index: number) => {
    const list = sections()
    if (!list.length || destroyed) return
    const idx = clamp(index, list.length)
    const top = topInScroller(list[idx], scroller)
    const my = ++token
    void animateScroll(scroller, top, 320).then(() => {
      if (destroyed || my !== token) return
    })
  }

  const go = (dir: 1 | -1) => scrollToIndex(getIndex() + dir)
  const goTo = (index: number) => scrollToIndex(index)

  const onKey = (e: KeyboardEvent) => {
    if (destroyed) return
    if (sections().length < 2) return
    const tag = (e.target as HTMLElement | null)?.tagName
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
    if (e.key === 'ArrowDown' || e.key === 'PageDown') {
      e.preventDefault()
      go(1)
    } else if (e.key === 'ArrowUp' || e.key === 'PageUp') {
      e.preventDefault()
      go(-1)
    } else if (e.key === 'Home') {
      e.preventDefault()
      goTo(0)
    } else if (e.key === 'End') {
      e.preventDefault()
      goTo(sections().length - 1)
    }
  }

  window.addEventListener('keydown', onKey)

  const api: SnapPageController = {
    go,
    goTo,
    getIndex,
    destroy: () => {
      destroyed = true
      token += 1
      window.removeEventListener('keydown', onKey)
      // Clear any leftover inline scroll locks from older builds
      scroller.style.removeProperty('overflow-y')
      scroller.style.removeProperty('touch-action')
      scroller.style.removeProperty('overscroll-behavior-y')
      delete (scroller as HTMLElement & { __cmsSnap?: SnapPageController }).__cmsSnap
    },
  }
  ;(scroller as HTMLElement & { __cmsSnap?: SnapPageController }).__cmsSnap = api
  return api
}

export function getSnapController(scroller: HTMLElement | null): SnapPageController | null {
  if (!scroller) return null
  return (scroller as HTMLElement & { __cmsSnap?: SnapPageController }).__cmsSnap ?? null
}
