import type { ComponentType } from 'react'

export type DashboardWidgetSpan = 'full' | 'half' | 'third'

export type DashboardWidgetId =
  | 'content-health'
  | 'mcp-activity'
  | 'analytics'
  | 'week-stats'
  | 'catalog-counts'
  | 'publish-status'
  | 'lifecycle-drafts'
  | 'messages'
  | 'activity'
  | 'support'
  | 'forms'
  | 'orders'
  | 'scheduler'
  | 'overload'
  | 'notifications'
  | 'newsletter'
  | 'blog-pulse'

export type DashboardLayoutPrefs = {
  order: DashboardWidgetId[]
  hidden: DashboardWidgetId[]
}

export type DashboardWidgetDef = {
  id: DashboardWidgetId
  title: string
  hint?: string
  /** Owning plugin; if set and disabled, widget is unavailable */
  plugin?: string
  span: DashboardWidgetSpan
  defaultVisible: boolean
  Component: ComponentType
}
