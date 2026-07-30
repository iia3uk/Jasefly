import type { BuilderElementDTO, PageLayout } from '@/types'
import { findElement, reduceLayout } from '@/builder/tree'

/** Canvas step fields: `step_0_title` → settings.items[0].title */
export const STEP_FIELD_RE = /^step_(\d+)_(.+)$/

type StepItem = Record<string, unknown>

function asItems(value: unknown): StepItem[] {
  if (!Array.isArray(value)) return []
  return value.map((row) => (row && typeof row === 'object' ? { ...(row as StepItem) } : {}))
}

/**
 * Commit in-progress contentEditable text into the layout tree.
 * Flat fields → settings[field]; step_* → settings.items[i][key] (never flat phantoms).
 */
export function flushInlineEdits(base: PageLayout, root: ParentNode | Document = document): PageLayout {
  if (typeof document !== 'undefined') {
    const active = document.activeElement as HTMLElement | null
    if (active?.isContentEditable) active.blur()
  }

  let next = base
  /** elId → pending items patch + flat keys to strip */
  const stepByEl = new Map<string, { items: StepItem[]; strip: Set<string> }>()

  root.querySelectorAll<HTMLElement>('[data-builder-editable][data-field]').forEach((shell) => {
    const field = shell.getAttribute('data-field')
    if (!field) return
    const host = shell.closest<HTMLElement>('[data-builder-id]')
    const elId = host?.getAttribute('data-builder-id')
    if (!elId) return
    const editable = shell.querySelector<HTMLElement>('[contenteditable]')
    if (!editable) return
    const text = editable.textContent?.trim() ?? ''
    const current = findElement(next, elId)
    if (!current) return

    const step = field.match(STEP_FIELD_RE)
    if (step) {
      const index = Number(step[1])
      const itemKey = step[2]
      if (!Number.isFinite(index) || index < 0 || !itemKey) return
      let bucket = stepByEl.get(elId)
      if (!bucket) {
        bucket = { items: asItems(current.settings?.items), strip: new Set() }
        stepByEl.set(elId, bucket)
      }
      while (bucket.items.length <= index) bucket.items.push({})
      const prev = bucket.items[index]?.[itemKey]
      const prevText = prev != null ? String(prev).trim() : ''
      if (text !== prevText) {
        bucket.items[index] = { ...bucket.items[index], [itemKey]: text }
      }
      bucket.strip.add(field)
      return
    }

    const prev = current.settings?.[field]
    const prevText = prev != null ? String(prev).trim() : ''
    if (text === prevText) return
    next = reduceLayout(next, { type: 'updateSettings', id: elId, settings: { [field]: text } })
  })

  for (const [elId, bucket] of stepByEl) {
    next = mapSettings(next, elId, (prev) => {
      const settings: Record<string, unknown> = { ...prev, items: bucket.items }
      for (const key of bucket.strip) delete settings[key]
      // Drop any leftover flat step_* phantoms from earlier flushes.
      for (const key of Object.keys(settings)) {
        if (STEP_FIELD_RE.test(key)) delete settings[key]
      }
      return settings
    })
  }

  return next
}

function mapSettings(
  layout: PageLayout,
  id: string,
  mutator: (settings: Record<string, unknown>) => Record<string, unknown>,
): PageLayout {
  const walk = (elements: BuilderElementDTO[]): BuilderElementDTO[] =>
    elements.map((el) => {
      const kids = el.elements?.length ? walk(el.elements) : el.elements
      if (el.id === id) {
        return { ...el, settings: mutator({ ...(el.settings ?? {}) }), ...(kids ? { elements: kids } : {}) }
      }
      return kids ? { ...el, elements: kids } : el
    })
  return { ...layout, elements: walk(layout.elements ?? []) }
}

/** Parse `step_3_text` → { index: 3, itemKey: 'text' } */
export function parseStepField(field: string | null | undefined): { index: number; itemKey: string } | null {
  if (!field) return null
  const m = field.match(STEP_FIELD_RE)
  if (!m) return null
  const index = Number(m[1])
  if (!Number.isFinite(index) || index < 0) return null
  return { index, itemKey: m[2] }
}

export function stepPartLabel(field: string): string {
  const parsed = parseStepField(field)
  if (!parsed) return field
  const keyLabels: Record<string, string> = {
    badge: 'Номер',
    title: 'Имя',
    text: 'Текст',
    body: 'Текст',
  }
  return `Шаг ${parsed.index + 1} · ${keyLabels[parsed.itemKey] ?? parsed.itemKey}`
}

/** Used by inspector — update one cell in items[]; flat key → undefined for tree delete. */
export function patchStepItem(
  settings: Record<string, unknown>,
  index: number,
  itemKey: string,
  value: string,
): Record<string, unknown> {
  const items = asItems(settings.items)
  while (items.length <= index) items.push({})
  items[index] = { ...items[index], [itemKey]: value }
  const flat = `step_${index}_${itemKey}`
  return { items, [flat]: undefined }
}
