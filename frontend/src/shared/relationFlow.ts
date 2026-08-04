export type RelationNode = {
  id: string
  label: string
  href?: string
  note?: string
}

export type RelationEdge = {
  from: string
  to: string
}

export type RelationFlowModel = {
  nodes: RelationNode[]
  edges: RelationEdge[]
  layout: 'chain' | 'hub'
}

function asRows(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value)
    ? (value.filter((x) => x && typeof x === 'object') as Array<Record<string, unknown>>)
    : []
}

function nodeId(row: Record<string, unknown>, index: number): string {
  const raw = String(row.id || row.slug || row.label || `node-${index + 1}`)
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
  return raw || `node-${index + 1}`
}

/**
 * Normalize builder settings into a relation graph.
 * If edges are empty, chain consecutive nodes in array order.
 */
export function normalizeRelationFlow(settings: Record<string, unknown> | null | undefined): RelationFlowModel {
  const layoutRaw = String(settings?.layout || 'chain').toLowerCase()
  const layout: RelationFlowModel['layout'] = layoutRaw === 'hub' ? 'hub' : 'chain'

  const nodes: RelationNode[] = asRows(settings?.nodes).map((row, index) => {
    const id = nodeId(row, index)
    const label = String(row.label || row.title || id).trim() || id
    const href = String(row.href || '').trim()
    const note = String(row.note || row.body || '').trim()
    return {
      id,
      label,
      ...(href ? { href } : {}),
      ...(note ? { note } : {}),
    }
  })

  const idSet = new Set(nodes.map((n) => n.id))
  let edges: RelationEdge[] = asRows(settings?.edges)
    .map((row) => ({
      from: String(row.from || '').trim().toLowerCase(),
      to: String(row.to || '').trim().toLowerCase(),
    }))
    .filter((e) => e.from && e.to && idSet.has(e.from) && idSet.has(e.to) && e.from !== e.to)

  if (!edges.length && nodes.length > 1) {
    edges = nodes.slice(0, -1).map((n, i) => ({ from: n.id, to: nodes[i + 1].id }))
  }

  return { nodes, edges, layout }
}

/** Ordered node ids for chain rendering (follow first edge path, then leftovers). */
export function chainOrder(nodes: RelationNode[], edges: RelationEdge[]): RelationNode[] {
  if (!nodes.length) return []
  if (!edges.length) return nodes

  const outgoing = new Map<string, string>()
  const inbound = new Set<string>()
  for (const e of edges) {
    if (!outgoing.has(e.from)) outgoing.set(e.from, e.to)
    inbound.add(e.to)
  }

  let start = nodes.find((n) => !inbound.has(n.id))?.id ?? nodes[0].id
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const ordered: RelationNode[] = []
  const seen = new Set<string>()
  let cur: string | undefined = start
  while (cur && byId.has(cur) && !seen.has(cur)) {
    seen.add(cur)
    ordered.push(byId.get(cur)!)
    cur = outgoing.get(cur)
  }
  for (const n of nodes) {
    if (!seen.has(n.id)) ordered.push(n)
  }
  return ordered
}
