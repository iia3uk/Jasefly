import { describe, expect, it } from 'vitest'
import { flushInlineEdits, parseStepField, patchStepItem } from './flushInlineEdits'
import type { PageLayout } from '@/types'

function layoutWithSteps(items: Array<Record<string, unknown>>, extra: Record<string, unknown> = {}): PageLayout {
  return {
    version: 1,
    elements: [
      {
        id: 'sec',
        elType: 'section',
        elements: [
          {
            id: 'col',
            elType: 'column',
            elements: [
              {
                id: 'w1',
                elType: 'widget',
                widgetType: 'steps-row',
                settings: { items, ...extra },
              },
            ],
          },
        ],
      },
    ],
  }
}

/** Minimal DOM stub — vitest runs in node (no jsdom). */
function mockDom(fields: Array<{ elId: string; field: string; text: string }>): ParentNode {
  const shells = fields.map((f) => {
    const editable = {
      textContent: f.text,
    }
    const shell = {
      getAttribute: (name: string) => (name === 'data-field' ? f.field : null),
      closest: (sel: string) => {
        if (sel !== '[data-builder-id]') return null
        return { getAttribute: (name: string) => (name === 'data-builder-id' ? f.elId : null) }
      },
      querySelector: (sel: string) => (sel === '[contenteditable]' ? editable : null),
    }
    return shell
  })
  return {
    querySelectorAll: () => shells,
  } as unknown as ParentNode
}

describe('flushInlineEdits', () => {
  it('merges step_* canvas text into items[] and strips flat phantoms', () => {
    const base = layoutWithSteps(
      [{ badge: '01', title: 'A', text: 'old' }],
      { step_0_text: 'phantom' },
    )
    const root = mockDom([{ elId: 'w1', field: 'step_0_text', text: 'new copy' }])
    const next = flushInlineEdits(base, root)
    const settings = next.elements![0].elements![0].elements![0].settings!
    expect(settings.items).toEqual([{ badge: '01', title: 'A', text: 'new copy' }])
    expect(settings).not.toHaveProperty('step_0_text')
  })

  it('updates flat fields as before', () => {
    const base: PageLayout = {
      version: 1,
      elements: [
        {
          id: 'sec',
          elType: 'section',
          elements: [
            {
              id: 'col',
              elType: 'column',
              elements: [
                { id: 'h1', elType: 'widget', widgetType: 'heading', settings: { text: 'Old' } },
              ],
            },
          ],
        },
      ],
    }
    const root = mockDom([{ elId: 'h1', field: 'text', text: 'Fresh' }])
    const next = flushInlineEdits(base, root)
    expect(next.elements![0].elements![0].elements![0].settings!.text).toBe('Fresh')
  })
})

describe('parseStepField / patchStepItem', () => {
  it('parses step fields', () => {
    expect(parseStepField('step_2_title')).toEqual({ index: 2, itemKey: 'title' })
    expect(parseStepField('headline')).toBeNull()
  })

  it('patches items and marks flat key for delete', () => {
    const next = patchStepItem({ items: [{ title: 'A' }], step_0_title: 'x' }, 0, 'title', 'B')
    expect(next.items).toEqual([{ title: 'B' }])
    expect(next.step_0_title).toBeUndefined()
  })
})
