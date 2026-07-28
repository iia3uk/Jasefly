import { describe, expect, it } from 'vitest'
import { parseLayout } from '@/builder/public/parseLayout'

describe('parseLayout', () => {
  it('returns null for missing page / empty payloads', () => {
    expect(parseLayout(null)).toBeNull()
    expect(parseLayout(undefined)).toBeNull()
    expect(parseLayout({})).toBeNull()
    expect(parseLayout({ layout_json: '' })).toBeNull()
  })

  it('prefers structured layout.elements', () => {
    const layout = { version: 1, elements: [{ id: 'a', type: 'section', children: [] }] }
    expect(parseLayout({ layout: layout as never })).toEqual(layout)
  })

  it('parses layout_json string and tolerates invalid JSON', () => {
    const layout = { version: 1, elements: [{ id: 'w', type: 'widget', widgetType: 'heading' }] }
    expect(parseLayout({ layout_json: JSON.stringify(layout) })).toEqual(layout)
    expect(parseLayout({ layout_json: '{not-json' })).toBeNull()
  })

  it('tolerates legacy layouts with unknown widget types in JSON', () => {
    const layout = {
      version: 1,
      elements: [
        { id: '1', type: 'widget', widgetType: 'totally-unknown-widget', settings: {} },
      ],
    }
    const parsed = parseLayout({ layout_json: JSON.stringify(layout) })
    expect(parsed?.elements?.[0]?.widgetType).toBe('totally-unknown-widget')
  })
})
