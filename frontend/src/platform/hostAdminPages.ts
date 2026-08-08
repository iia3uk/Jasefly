import type { ComponentType } from 'react'

/**
 * Host-provided admin page components that installable packages may bind by key.
 * Universal bridge for large admin UIs still shipping in the host SPA until
 * fully moved into package frontend-dist.
 */
const pages = new Map<string, ComponentType<Record<string, never>>>()

export function provideHostAdminPage(
  key: string,
  Component: ComponentType<Record<string, never>>,
): void {
  const k = key.trim()
  if (!k) return
  pages.set(k, Component)
}

export function resolveHostAdminPage(
  key: string,
): ComponentType<Record<string, never>> | undefined {
  return pages.get(key.trim())
}

export function listHostAdminPageKeys(): string[] {
  return [...pages.keys()].sort()
}
