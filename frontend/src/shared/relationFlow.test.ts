import { describe, expect, it } from 'vitest'
import { chainOrder, normalizeRelationFlow } from './relationFlow'

describe('relationFlow', () => {
  it('builds a chain from nodes when edges are omitted', () => {
    const model = normalizeRelationFlow({
      nodes: [
        { label: 'Jasefly', href: '/projects/jasefly' },
        { label: 'Ясень', id: 'yasen' },
        { label: 'Nest' },
      ],
    })
    expect(model.layout).toBe('chain')
    expect(model.nodes.map((n) => n.id)).toEqual(['jasefly', 'yasen', 'nest'])
    expect(model.edges).toEqual([
      { from: 'jasefly', to: 'yasen' },
      { from: 'yasen', to: 'nest' },
    ])
  })

  it('keeps explicit edges and orders the chain from the root', () => {
    const model = normalizeRelationFlow({
      layout: 'hub',
      nodes: [
        { id: 'a', label: 'A' },
        { id: 'b', label: 'B' },
        { id: 'c', label: 'C' },
      ],
      edges: [
        { from: 'a', to: 'c' },
        { from: 'a', to: 'b' },
      ],
    })
    expect(model.layout).toBe('hub')
    expect(chainOrder(model.nodes, model.edges).map((n) => n.id)).toEqual(['a', 'c', 'b'])
  })
})
