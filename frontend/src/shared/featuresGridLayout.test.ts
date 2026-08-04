import { describe, expect, it } from 'vitest'
import {
  lastRowGridColumnStart,
  normalizeLastRowAlignment,
  parseFeatureMarkers,
} from './featuresGridLayout'

describe('featuresGridLayout', () => {
  it('normalizes alignment', () => {
    expect(normalizeLastRowAlignment('center')).toBe('center')
    expect(normalizeLastRowAlignment('END')).toBe('end')
    expect(normalizeLastRowAlignment('')).toBe('start')
  })

  it('parses markers from string or array', () => {
    expect(parseFeatureMarkers({ markers: 'PHP · React · Go' })).toEqual(['PHP', 'React', 'Go'])
    expect(parseFeatureMarkers({ tags: ['Unity', 'Godot'] })).toEqual(['Unity', 'Godot'])
    expect(parseFeatureMarkers({ markers: '' })).toEqual([])
  })

  it('centers two leftover cards in a 3-column grid', () => {
    // 5 items → last row indices 3,4 start at cols 2 and 3
    expect(lastRowGridColumnStart(3, 5, 3, 'center')).toBe(2)
    expect(lastRowGridColumnStart(4, 5, 3, 'center')).toBe(3)
    expect(lastRowGridColumnStart(0, 5, 3, 'center')).toBeUndefined()
    expect(lastRowGridColumnStart(2, 5, 3, 'center')).toBeUndefined()
  })

  it('ends leftover row and ignores start align', () => {
    expect(lastRowGridColumnStart(3, 5, 3, 'end')).toBe(2)
    expect(lastRowGridColumnStart(4, 5, 3, 'end')).toBe(3)
    expect(lastRowGridColumnStart(3, 5, 3, 'start')).toBeUndefined()
  })
})
