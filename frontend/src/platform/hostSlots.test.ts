import { describe, expect, it, afterEach } from 'vitest'
import {
  clearHostSlotsForSlug,
  listHostSlotContributions,
  registerHostSlot,
} from '@/platform/hostSlots'

function Stub(): null {
  return null
}

afterEach(() => {
  clearHostSlotsForSlug('analytics')
  clearHostSlotsForSlug('support-demo')
})

describe('hostSlots', () => {
  it('registers and clears by slug (no product hardcode)', () => {
    registerHostSlot({
      id: 'beacon',
      slug: 'analytics',
      slot: 'site.body.end',
      Component: Stub,
      requiresConsentCategory: 'analytics',
    })
    registerHostSlot({
      id: 'pulse',
      slug: 'analytics',
      slot: 'admin.dashboard',
      Component: Stub,
    })
    registerHostSlot({
      id: 'bell',
      slug: 'analytics',
      slot: 'admin.header',
      Component: Stub,
    })
    expect(listHostSlotContributions('site.body.end')).toHaveLength(1)
    expect(listHostSlotContributions('admin.dashboard')).toHaveLength(1)
    expect(listHostSlotContributions('admin.header')).toHaveLength(1)
    clearHostSlotsForSlug('analytics')
    expect(listHostSlotContributions()).toHaveLength(0)
  })

  it('keeps other packages when one slug is cleared', () => {
    registerHostSlot({
      id: 'a',
      slug: 'analytics',
      slot: 'site.body.end',
      Component: Stub,
    })
    registerHostSlot({
      id: 'b',
      slug: 'support-demo',
      slot: 'site.body.end',
      Component: Stub,
    })
    clearHostSlotsForSlug('analytics')
    const left = listHostSlotContributions('site.body.end')
    expect(left).toHaveLength(1)
    expect(left[0]?.slug).toBe('support-demo')
  })

  it('returns stable snapshot identity until registry mutates (useSyncExternalStore)', () => {
    registerHostSlot({
      id: 'beacon',
      slug: 'analytics',
      slot: 'site.body.end',
      Component: Stub,
    })
    const a = listHostSlotContributions('site.body.end')
    const b = listHostSlotContributions('site.body.end')
    expect(a).toBe(b)
    registerHostSlot({
      id: 'extra',
      slug: 'support-demo',
      slot: 'site.body.end',
      Component: Stub,
    })
    const c = listHostSlotContributions('site.body.end')
    expect(c).not.toBe(a)
    expect(c).toHaveLength(2)
  })
})
