import { describe, expect, it } from 'vitest'
import { SHOWCASE_DESKTOP, showcaseSecondaryMediaSlot } from './showcaseGeometry'

describe('showcaseGeometry', () => {
  it('locks secondary media near 1:1 at max-w-6xl', () => {
    const slot = showcaseSecondaryMediaSlot()
    expect(slot.secondaryMediaAspect).toBeGreaterThan(0.95)
    expect(slot.secondaryMediaAspect).toBeLessThan(1.05)
    expect(SHOWCASE_DESKTOP.secondaryAssetPx.x1).toEqual({ w: 1200, h: 1200 })
  })
})
