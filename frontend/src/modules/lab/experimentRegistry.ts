import type { ComponentType } from 'react'

/**
 * Static whitelist of Lab experiment entries.
 * Keys must match backend LabEntryRegistry — never import() with a DB string.
 */
export type LabExperimentModule = {
  default: ComponentType<LabExperimentProps>
}

export type LabExperimentProps = {
  content: Record<string, unknown>
  settings: Record<string, unknown>
  experiment: {
    id: number
    name: string
    slug: string
    entry_key: string
    status: string
    is_public: boolean
    noindex: boolean
    render_mode: string
    preview?: boolean
  }
}

type Loader = () => Promise<LabExperimentModule>

const experimentRegistry: Record<string, Loader> = {
  starter: () => import('./experiments/starter'),
  reference: () => import('./experiments/reference'),
}

export function getExperimentLoader(entryKey: string): Loader | null {
  return experimentRegistry[entryKey] ?? null
}

export function listExperimentKeys(): string[] {
  return Object.keys(experimentRegistry)
}

export function hasExperimentEntry(entryKey: string): boolean {
  return entryKey in experimentRegistry
}

export default experimentRegistry
