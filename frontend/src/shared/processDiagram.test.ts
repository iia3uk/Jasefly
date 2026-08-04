import { describe, expect, it } from 'vitest'
import { mobileProcessOrder, normalizeProcessDiagram } from './processDiagram'

describe('processDiagram', () => {
  it('normalizes nodes, roles and center', () => {
    const model = normalizeProcessDiagram({
      title: 'Как я работаю',
      center_node: { title: 'Рабочая система', description: 'Ядро' },
      nodes: [
        { id: 'idea', title: 'Идея', role: 'input' },
        { id: 'proto', title: 'Прототип', role: 'input' },
        { id: 'arch', title: 'Архитектура', role: 'core' },
        { id: 'auto', title: 'Автоматизация', role: 'core' },
        { id: 'ops', title: 'Эксплуатация', role: 'output' },
        { id: 'grow', title: 'Развитие', role: 'feedback' },
      ],
      connections: [
        { from: 'idea', to: 'proto' },
        { from: 'proto', to: 'arch' },
        { from: 'grow', to: 'idea', type: 'feedback' },
      ],
    })
    expect(model.centerTitle).toBe('Рабочая система')
    expect(model.nodes.filter((n) => n.role === 'core')).toHaveLength(2)
    expect(model.connections.some((c) => c.type === 'feedback')).toBe(true)
    expect(mobileProcessOrder(model.nodes).map((n) => n.id)).toEqual([
      'idea', 'proto', 'arch', 'auto', 'ops', 'grow',
    ])
  })
})
