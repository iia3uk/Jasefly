/**
 * Plugin contract types — shared across the CMS kernel and plugins.
 * Mirrors the backend PHP contract in backend/src/Core/Contract.
 */

import type { ComponentType, ReactElement } from 'react'

/** Column / field types supported by the blueprint system. */
export type ColumnType =
  | 'string'
  | 'text'
  | 'longtext'
  | 'int'
  | 'bigint'
  | 'decimal'
  | 'bool'
  | 'date'
  | 'datetime'
  | 'json'
  | 'uuid'

/** Admin widget used to render a field in the editor. */
export type WidgetKind =
  | 'text'
  | 'textarea'
  | 'richtext'
  | 'number'
  | 'toggle'
  | 'select'
  | 'media'
  | 'url'
  | 'color'
  | 'date'
  | 'datetime'
  | 'json'
  | 'code'
  | 'hidden'
  | 'custom'

type Bindable = { bindable?: boolean }

export type SettingsField =
  | ({ key: string; label: string; type: 'text' | 'textarea' | 'number' | 'url' | 'color' | 'date' | 'datetime' | 'json' | 'code' | 'hidden' } & Bindable)
  | { key: string; label: string; type: 'select'; options: Array<{ value: string; label: string }> }
  | { key: string; label: string; type: 'toggle' }
  | ({ key: string; label: string; type: 'media' } & Bindable)
  | ({ key: string; label: string; type: 'richtext' } & Bindable)
  | { key: string; label: string; type: 'custom'; component: ComponentType<{ value: unknown; onChange: (v: unknown) => void }> }

/** A single column/field definition in a blueprint. */
export type ColumnDef = {
  type: ColumnType
  widget: WidgetKind | null
  label: string
  required: boolean
  default: unknown
  nullable: boolean
  index: boolean
  permission: string | null
  visible: boolean
  options: Array<{ value: string; label: string }> | null
  min: number | null
  max: number | null
  pattern: string | null
  help: string | null
}

/** Canonical blueprint describing a content type. */
export type Blueprint = {
  key: string
  table: string
  label: string
  singleton: boolean
  soft_delete: boolean
  slug: boolean
  seo: boolean
  columns: Record<string, ColumnDef>
  indexes: Array<Record<string, unknown>>
  permissions: string[]
  group: string
  orderable: boolean
  icon: string | null
}

/** A builder block contributed by a plugin. */
export type BlockDefinition = {
  type: string
  label: string
  category: 'structure' | 'basic' | 'portfolio' | 'commerce' | 'integration' | string
  icon?: string
  defaultSettings: Record<string, unknown>
  settingsFields: SettingsField[]
  Render: ComponentType<{ settings: Record<string, unknown>; editMode?: boolean }>
}

/** A custom admin screen beyond generic CRUD (e.g. a dedicated editor). */
export type AdminScreen = {
  /** Route path under /admin, e.g. "projects/:id/edit" or "media". No leading slash. */
  path: string
  label: string
  group: string
  permission?: string
  /** Full-screen layout (no admin shell), e.g. page builder. */
  fullscreen?: boolean
  /** Static component (no props). */
  Component?: ComponentType<Record<string, never>>
  /** Lazy component (no props). */
  lazy?: () => Promise<{ default: ComponentType<Record<string, never>> }>
  /** Pre-built element (for screens needing props). Mutually exclusive with Component/lazy. */
  element?: ReactElement
}

/** A public SPA route contributed by a plugin. */
export type PublicRouteDef = {
  path: string
  label: string
  /** Lazy component for the route. */
  lazy: () => Promise<{ default: ComponentType<unknown> }>
}
