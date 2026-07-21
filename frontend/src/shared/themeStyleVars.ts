import type { CSSProperties } from 'react'
import type { ThemeSettings } from '@/types'

/** CSS variables so preview/builder canvas matches the public site theme. */
export function themeStyleVars(theme?: Partial<ThemeSettings> | null): CSSProperties {
  if (!theme) return {}
  return {
    ['--preview-primary' as string]: theme.primary_color || undefined,
    ['--preview-accent' as string]: theme.accent_color || undefined,
    ['--preview-bg' as string]: theme.background_color || undefined,
    ['--preview-surface' as string]: theme.surface_color || undefined,
    ['--preview-text' as string]: theme.text_color || undefined,
    ['--preview-muted' as string]: theme.muted_color || undefined,
    ['--preview-radius' as string]: theme.border_radius || undefined,
    ['--preview-font-heading' as string]: theme.font_display ? `"${theme.font_display}", sans-serif` : undefined,
    ['--preview-font-body' as string]: theme.font_body ? `"${theme.font_body}", sans-serif` : undefined,
    ['--primary' as string]: theme.primary_color || undefined,
    ['--accent' as string]: theme.accent_color || undefined,
    ['--background' as string]: theme.background_color || undefined,
    ['--surface' as string]: theme.surface_color || undefined,
    ['--text' as string]: theme.text_color || undefined,
    ['--muted' as string]: theme.muted_color || undefined,
    ['--radius' as string]: theme.border_radius || undefined,
    ['--font-heading' as string]: theme.font_display ? `"${theme.font_display}", sans-serif` : undefined,
    ['--font-body' as string]: theme.font_body ? `"${theme.font_body}", sans-serif` : undefined,
  }
}
