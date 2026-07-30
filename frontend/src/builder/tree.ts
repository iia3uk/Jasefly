import type { BuilderElementDTO, PageLayout } from '@/types'
import { createSection, createWidget, createColumn, createId, type TreeOp } from '@/builder/types'
import { getWidget } from '@/builder/registry'

function mapTree(elements: BuilderElementDTO[], fn: (el: BuilderElementDTO) => BuilderElementDTO | null): BuilderElementDTO[] {
  const out: BuilderElementDTO[] = []
  for (const el of elements) {
    const next = fn({
      ...el,
      elements: el.elements ? mapTree(el.elements, fn) : [],
    })
    if (next) out.push(next)
  }
  return out
}

function findParent(elements: BuilderElementDTO[], id: string, parent: BuilderElementDTO | null = null): { parent: BuilderElementDTO | null; index: number; list: BuilderElementDTO[] } | null {
  for (let i = 0; i < elements.length; i++) {
    if (elements[i].id === id) return { parent, index: i, list: elements }
    const kids = elements[i].elements
    if (kids?.length) {
      const hit = findParent(kids, id, elements[i])
      if (hit) return hit
    }
  }
  return null
}

function removeId(elements: BuilderElementDTO[], id: string): BuilderElementDTO[] {
  return elements
    .filter((el) => el.id !== id)
    .map((el) => ({ ...el, elements: el.elements ? removeId(el.elements, id) : [] }))
}

function extractNode(elements: BuilderElementDTO[], id: string): { tree: BuilderElementDTO[]; node: BuilderElementDTO | null } {
  let node: BuilderElementDTO | null = null
  const walk = (list: BuilderElementDTO[]): BuilderElementDTO[] =>
    list
      .filter((el) => {
        if (el.id === id) {
          node = el
          return false
        }
        return true
      })
      .map((el) => ({ ...el, elements: el.elements ? walk(el.elements) : [] }))
  return { tree: walk(elements), node }
}

function insertAt(elements: BuilderElementDTO[], parentId: string, node: BuilderElementDTO, index?: number): BuilderElementDTO[] {
  return elements.map((el) => {
    if (el.id === parentId) {
      const kids = [...(el.elements ?? [])]
      const i = index == null ? kids.length : Math.max(0, Math.min(index, kids.length))
      kids.splice(i, 0, node)
      return { ...el, elements: kids }
    }
    return { ...el, elements: el.elements ? insertAt(el.elements, parentId, node, index) : [] }
  })
}

function insertRoot(elements: BuilderElementDTO[], node: BuilderElementDTO, index?: number): BuilderElementDTO[] {
  const next = [...elements]
  const i = index == null ? next.length : Math.max(0, Math.min(index, next.length))
  next.splice(i, 0, node)
  return next
}

/** Hidden from public site for everyone (still visible in builder as a ghost). */
export function isBuilderHidden(el: BuilderElementDTO | null | undefined): boolean {
  return Boolean(el?.settings?.hidden)
}

/** Deep clone with fresh ids (for duplicate / paste). */
export function cloneElementDeep(el: BuilderElementDTO): BuilderElementDTO {
  const prefix = el.elType === 'section' ? 'sec' : el.elType === 'column' ? 'col' : 'w'
  return {
    ...el,
    id: createId(prefix),
    settings: { ...(el.settings ?? {}) },
    elements: (el.elements ?? []).map(cloneElementDeep),
  }
}

/** Parent may accept this child type (section→root, column→section, widget→column, container-widget→widget). */
export function canAcceptChild(parent: BuilderElementDTO | null, child: BuilderElementDTO): boolean {
  if (!parent) return child.elType === 'section'
  if (parent.elType === 'section') return child.elType === 'column'
  if (parent.elType === 'column') return child.elType === 'widget'
  if (parent.elType === 'widget' && child.elType === 'widget') {
    const def = getWidget(parent.widgetType ?? '')
    return Boolean(def?.acceptsChildren)
  }
  return false
}

export function widgetAcceptsChildren(el: BuilderElementDTO | null | undefined): boolean {
  if (!el || el.elType !== 'widget') return false
  return Boolean(getWidget(el.widgetType ?? '')?.acceptsChildren)
}

function containsId(el: BuilderElementDTO, id: string): boolean {
  if (el.id === id) return true
  return (el.elements ?? []).some((kid) => containsId(kid, id))
}

/** Paste clipboard node relative to selection (sibling after, or into container). */
export function pasteNode(
  layout: PageLayout,
  clipboard: BuilderElementDTO,
  selectedId: string | null,
): { layout: PageLayout; newId: string } | null {
  const node = cloneElementDeep(clipboard)
  if (!selectedId) {
    if (node.elType === 'section') {
      return { layout: { ...layout, elements: [...layout.elements, node] }, newId: node.id }
    }
    const ensured = ensureColumnForDrop(layout)
    if (node.elType === 'widget') {
      return {
        layout: { ...ensured.layout, elements: insertAt(ensured.layout.elements, ensured.columnId, node) },
        newId: node.id,
      }
    }
    return null
  }
  const selected = findElement(layout, selectedId)
  if (!selected) return null
  if (canAcceptChild(selected, node)) {
    return {
      layout: { ...layout, elements: insertAt(layout.elements, selected.id, node) },
      newId: node.id,
    }
  }
  const hit = findParent(layout.elements, selectedId)
  if (!hit || !canAcceptChild(hit.parent, node)) return null
  if (!hit.parent) {
    const next = [...hit.list]
    next.splice(hit.index + 1, 0, node)
    return { layout: { ...layout, elements: next }, newId: node.id }
  }
  return {
    layout: { ...layout, elements: insertAt(layout.elements, hit.parent.id, node, hit.index + 1) },
    newId: node.id,
  }
}

export function reduceLayout(layout: PageLayout, op: TreeOp): PageLayout {
  switch (op.type) {
    case 'setLayout':
      return op.layout
    case 'addSection': {
      const section = createSection(op.columns ?? 1)
      return { ...layout, elements: insertRoot(layout.elements, section, op.index) }
    }
    case 'addColumn': {
      const col = createColumn(100)
      return { ...layout, elements: insertAt(layout.elements, op.parentId, col, op.index) }
    }
    case 'updateSettings': {
      return {
        ...layout,
        elements: mapTree(layout.elements, (el) => {
          if (el.id !== op.id) return el
          const merged: Record<string, unknown> = { ...(el.settings ?? {}), ...op.settings }
          for (const [k, v] of Object.entries(op.settings)) {
            if (v === undefined) delete merged[k]
          }
          return { ...el, settings: merged }
        }),
      }
    }
    case 'remove': {
      return { ...layout, elements: removeId(layout.elements, op.id) }
    }
    case 'addWidget': {
      const def = getWidget(op.widgetType)
      if (!def) return layout
      const widget = createWidget(op.widgetType, def.defaultSettings)
      return { ...layout, elements: insertAt(layout.elements, op.parentId, widget, op.index) }
    }
    case 'duplicate': {
      const hit = findParent(layout.elements, op.id)
      if (!hit) return layout
      const source = hit.list[hit.index]
      if (!source) return layout
      const clone = cloneElementDeep(source)
      if (!hit.parent) {
        const next = [...hit.list]
        next.splice(hit.index + 1, 0, clone)
        return { ...layout, elements: next }
      }
      return { ...layout, elements: insertAt(layout.elements, hit.parent.id, clone, hit.index + 1) }
    }
    case 'move': {
      const { tree, node } = extractNode(layout.elements, op.id)
      if (!node) return layout
      const targetParentId = op.targetParentId
      if (targetParentId === '__root__' || targetParentId === '') {
        if (!canAcceptChild(null, node)) return layout
        return { ...layout, elements: insertRoot(tree, node, op.index) }
      }
      const targetParent = findElement({ ...layout, elements: tree }, targetParentId)
      if (!targetParent || !canAcceptChild(targetParent, node)) return layout
      if (containsId(node, targetParentId)) return layout
      return { ...layout, elements: insertAt(tree, targetParentId, node, op.index) }
    }
    case 'reorder': {
      const hit = findParent(layout.elements, op.id)
      if (!hit) return layout
      const { parent, index, list } = hit
      if (op.toIndex === index || op.toIndex < 0 || op.toIndex >= list.length) return layout
      const next = [...list]
      const [node] = next.splice(index, 1)
      next.splice(op.toIndex, 0, node)
      if (!parent) {
        return { ...layout, elements: next }
      }
      return {
        ...layout,
        elements: replaceChildren(layout.elements, parent.id, next),
      }
    }
    default:
      return layout
  }
}

function replaceChildren(
  elements: BuilderElementDTO[],
  parentId: string,
  children: BuilderElementDTO[],
): BuilderElementDTO[] {
  return elements.map((el) => {
    if (el.id === parentId) return { ...el, elements: children }
    return { ...el, elements: el.elements ? replaceChildren(el.elements, parentId, children) : [] }
  })
}

export function findElement(layout: PageLayout, id: string | null | undefined): BuilderElementDTO | null {
  if (!id) return null
  const walk = (list: BuilderElementDTO[]): BuilderElementDTO | null => {
    for (const el of list) {
      if (el.id === id) return el
      if (el.elements?.length) {
        const hit = walk(el.elements)
        if (hit) return hit
      }
    }
    return null
  }
  return walk(layout.elements)
}

/** Path from root section to element (inclusive). */
export function findElementPath(layout: PageLayout, id: string | null | undefined): BuilderElementDTO[] {
  if (!id) return []
  const walk = (list: BuilderElementDTO[], trail: BuilderElementDTO[]): BuilderElementDTO[] | null => {
    for (const el of list) {
      if (el.id === id) return [...trail, el]
      if (el.elements?.length) {
        const hit = walk(el.elements, [...trail, el])
        if (hit) return hit
      }
    }
    return null
  }
  return walk(layout.elements, []) ?? []
}

export function ensureColumnForDrop(layout: PageLayout): { layout: PageLayout; columnId: string } {
  const firstSection = layout.elements[0]
  const firstCol = firstSection?.elements?.[0]
  if (firstCol?.elType === 'column') {
    return { layout, columnId: firstCol.id }
  }
  const section = createSection(1)
  return {
    layout: { ...layout, elements: [...layout.elements, section] },
    columnId: section.elements![0].id,
  }
}

export { findParent, createId }
