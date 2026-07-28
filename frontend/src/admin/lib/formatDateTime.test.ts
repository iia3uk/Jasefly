/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import { formatMoscowDateTime, parseAdminDateTime } from './formatDateTime'

describe('formatMoscowDateTime', () => {
  it('treats naive MySQL DATETIME as Moscow wall clock (does not add +3h via false Z)', () => {
    // Hosting stores MSK wall time without timezone; old UI appended Z → showed +3h.
    expect(formatMoscowDateTime('2026-07-28 21:15:54')).toMatch(/28.*июл.*21:15/i)
  })

  it('converts UTC ISO to Moscow', () => {
    // 18:15Z = 21:15 MSK
    const text = formatMoscowDateTime('2026-07-28T18:15:54.000Z')
    expect(text).toMatch(/28.*июл.*21:15/i)
  })

  it('parses naive datetime as +03:00', () => {
    const d = parseAdminDateTime('2026-07-28 21:15:54')
    expect(d).not.toBeNull()
    expect(d!.toISOString()).toBe('2026-07-28T18:15:54.000Z')
  })
})
