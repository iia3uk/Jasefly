export type ProcessNodeRole = 'input' | 'core' | 'output' | 'feedback'
export type ProcessNodeEmphasis = 'default' | 'primary'
export type ProcessConnectionType = 'direct' | 'feedback'

export type ProcessNode = {
  id: string
  title: string
  description?: string
  role?: ProcessNodeRole
  emphasis?: ProcessNodeEmphasis
}

export type ProcessConnection = {
  from: string
  to: string
  type?: ProcessConnectionType
}

export type ProcessDiagramModel = {
  title: string
  subtitle: string
  nodes: ProcessNode[]
  connections: ProcessConnection[]
  centerTitle: string
  centerDescription: string
  mobileMode: 'vertical'
}

function asRows(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value)
    ? (value.filter((x) => x && typeof x === 'object') as Array<Record<string, unknown>>)
    : []
}

function nodeId(row: Record<string, unknown>, index: number): string {
  const raw = String(row.id || row.title || `node-${index + 1}`)
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
  return raw || `node-${index + 1}`
}

function asRole(value: unknown): ProcessNodeRole | undefined {
  const v = String(value || '').toLowerCase()
  if (v === 'input' || v === 'core' || v === 'output' || v === 'feedback') return v
  return undefined
}

/** Normalize builder settings into a process diagram model. */
export function normalizeProcessDiagram(settings: Record<string, unknown> | null | undefined): ProcessDiagramModel {
  const nodes: ProcessNode[] = asRows(settings?.nodes).map((row, index) => {
    const id = nodeId(row, index)
    const title = String(row.title || row.label || id).trim() || id
    const description = String(row.description || row.body || row.text || '').trim()
    const role = asRole(row.role)
    const emphasis = String(row.emphasis || '').toLowerCase() === 'primary' ? 'primary' as const : 'default' as const
    return {
      id,
      title,
      ...(description ? { description } : {}),
      ...(role ? { role } : {}),
      emphasis,
    }
  })

  const idSet = new Set(nodes.map((n) => n.id))
  let connections: ProcessConnection[] = asRows(settings?.connections).map((row) => ({
    from: String(row.from || '').trim().toLowerCase(),
    to: String(row.to || '').trim().toLowerCase(),
    type: String(row.type || '').toLowerCase() === 'feedback' ? 'feedback' as const : 'direct' as const,
  })).filter((c) => c.from && c.to && idSet.has(c.from) && idSet.has(c.to))

  if (!connections.length && nodes.length > 1) {
    connections = nodes.slice(0, -1).map((n, i) => ({
      from: n.id,
      to: nodes[i + 1].id,
      type: 'direct' as const,
    }))
    const last = nodes[nodes.length - 1]
    if (last.role === 'feedback' || String(last.id).includes('развит') || /growth|evolve|развит/i.test(last.title)) {
      connections.push({ from: last.id, to: nodes[0].id, type: 'feedback' })
    }
  }

  const center = settings?.center_node && typeof settings.center_node === 'object'
    ? (settings.center_node as Record<string, unknown>)
    : null

  return {
    title: String(settings?.title || 'Как я работаю'),
    subtitle: String(settings?.subtitle || settings?.description || ''),
    nodes,
    connections,
    centerTitle: String(settings?.center_title || center?.title || 'Рабочая система'),
    centerDescription: String(settings?.center_description || center?.description || ''),
    mobileMode: 'vertical',
  }
}

export function nodesByRole(nodes: ProcessNode[], role: ProcessNodeRole): ProcessNode[] {
  return nodes.filter((n) => n.role === role)
}

/** Mobile order: inputs → cores → outputs → feedback. */
export function mobileProcessOrder(nodes: ProcessNode[]): ProcessNode[] {
  const order: ProcessNodeRole[] = ['input', 'core', 'output', 'feedback']
  const used = new Set<string>()
  const out: ProcessNode[] = []
  for (const role of order) {
    for (const n of nodes) {
      if (n.role === role && !used.has(n.id)) {
        used.add(n.id)
        out.push(n)
      }
    }
  }
  for (const n of nodes) {
    if (!used.has(n.id)) out.push(n)
  }
  return out
}
