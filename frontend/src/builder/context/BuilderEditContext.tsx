import { createContext, useContext, type ReactNode } from 'react'

export type BuilderEditContextValue = {
  editMode: boolean
  elementId: string
  selectedId: string | null
  selectedPart: string | null
  settings: Record<string, unknown>
  /** Select widget; pass part to focus a sub-field in one shot. */
  onSelectElement: (id: string, opts?: { part?: string | null }) => void
  onSelectPart: (part: string | null) => void
  onPatch: (patch: Record<string, unknown>) => void
}

const BuilderEditContext = createContext<BuilderEditContextValue | null>(null)

export function BuilderEditProvider({
  value,
  children,
}: {
  value: BuilderEditContextValue
  children: ReactNode
}) {
  return <BuilderEditContext.Provider value={value}>{children}</BuilderEditContext.Provider>
}

export function useBuilderEdit() {
  return useContext(BuilderEditContext)
}
