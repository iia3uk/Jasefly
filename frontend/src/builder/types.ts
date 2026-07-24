import type { ComponentType } from 'react'
import type { BuilderElementDTO, PageLayout } from '@/types'

export type ElType = 'section' | 'column' | 'widget'
export type BuilderElement = BuilderElementDTO

export type WidgetCategory = 'structure' | 'basic' | 'portfolio' | 'commerce' | 'integration' | (string & {})

type Bindable = { bindable?: boolean }

export type SettingsField =
  | ({ key: string; label: string; type: 'text' | 'textarea' | 'number' | 'url' | 'color' | 'date' | 'datetime' | 'json' | 'code' | 'hidden' } & Bindable)
  | { key: string; label: string; type: 'select'; options: Array<{ value: string; label: string }> }
  | { key: string; label: string; type: 'toggle' }
  | ({ key: string; label: string; type: 'media' } & Bindable)
  | ({ key: string; label: string; type: 'richtext' } & Bindable)
  | { key: string; label: string; type: 'custom'; component: ComponentType<{ value: unknown; onChange: (v: unknown) => void }> }

export type WidgetDefinition = {
  type: string
  label: string
  category: WidgetCategory
  icon?: string
  /** Owning plugin — widget is hidden on the public site when the plugin is off. */
  plugin?: string
  defaultSettings: Record<string, unknown>
  settingsFields: SettingsField[]
  Render: ComponentType<{ settings: Record<string, unknown>; editMode?: boolean }>
}

export type EmptyLayout = PageLayout

export function createId(prefix = 'el'): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`
}

export function emptyLayout(): PageLayout {
  return {
    version: 1,
    elements: [
      {
        id: createId('sec'),
        elType: 'section',
        settings: { paddingY: '4rem', gap: '1.5rem', columns: 1 },
        elements: [
          {
            id: createId('col'),
            elType: 'column',
            settings: { width: 100 },
            elements: [],
          },
        ],
      },
    ],
  }
}

export function createColumn(width = 100): BuilderElement {
  return {
    id: createId('col'),
    elType: 'column',
    settings: { width },
    elements: [],
  }
}

export function createSection(columns = 1): BuilderElement {
  const n = Math.min(12, Math.max(1, columns))
  const cols = Array.from({ length: n }, () =>
    createColumn(Math.round((100 / n) * 100) / 100),
  )
  return {
    id: createId('sec'),
    elType: 'section',
    settings: { paddingY: '3rem', gap: '1.5rem', columns: n },
    elements: cols,
  }
}

export function createWidget(widgetType: string, defaults: Record<string, unknown>): BuilderElement {
  return {
    id: createId('w'),
    elType: 'widget',
    widgetType,
    settings: { ...defaults },
    elements: [],
  }
}

export type EditorSelection = { id: string } | null

export type TreeOp =
  | { type: 'select'; id: string | null }
  | { type: 'updateSettings'; id: string; settings: Record<string, unknown> }
  | { type: 'remove'; id: string }
  | { type: 'addSection'; columns?: number; index?: number }
  | { type: 'addColumn'; parentId: string; index?: number }
  | { type: 'addWidget'; parentId: string; widgetType: string; index?: number }
  | { type: 'move'; id: string; targetParentId: string; index: number }
  /** Reorder within the same parent (root sections or children of one node). */
  | { type: 'reorder'; id: string; toIndex: number }
  /** Deep-clone element and insert as next sibling. */
  | { type: 'duplicate'; id: string }
  | { type: 'setLayout'; layout: PageLayout }

export type PanelTab = 'widgets' | 'structure'

export type DeviceMode = 'desktop' | 'tablet' | 'mobile'
